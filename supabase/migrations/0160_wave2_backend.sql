-- =============================================================================
-- 0160 — Wave 2: backend contract support for the Supabase implementation
-- =============================================================================
-- 1. Staff permission matrix in SQL (mirrors packages/auth/src/staff.ts; a unit
--    test compares the two).
-- 2. Profile fields used by the account pages; hardened signup provisioning;
--    terms acceptance and deletion requests through RPCs.
-- 3. Medical Chronicles listening history and saved episodes.
-- 4. Email delivery log (never stores verification or reset links).
-- 5. Distributed rate limiter (N-6).
-- 6. Audit log: reason column, database-level hash chain, staff RPC, verifier.
-- 7. Staff user directory, own-session listing, public source summary.
-- 8. Recurring-payment reference column.
-- 9. Explicit privilege reset for every table created since 0120, so security
--    never depends on the platform's "auto-expose new tables" default.
--
-- Reversal: drop the objects created here (listed at the bottom) and the added
-- columns. Data in the new tables is lost on reversal.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Staff permissions
-- ---------------------------------------------------------------------------
create table app_private.role_permissions (
  role       public.platform_role not null,
  permission text not null,
  primary key (role, permission)
);

insert into app_private.role_permissions (role, permission)
select r.role::public.platform_role, p.permission
from (values ('super_admin'), ('admin')) as r(role)
cross join (values
  ('admin:access'), ('users:read'), ('users:manage'), ('roles:grant'), ('chronicles:edit'), ('chronicles:review'),
  ('chronicles:categories'), ('creators:review'), ('plans:manage'), ('subscriptions:read'), ('subscriptions:override'),
  ('payments:read'), ('payments:reconcile'), ('audit:read'), ('settings:manage'), ('moderation:act')
) as p(permission);

insert into app_private.role_permissions (role, permission) values
  ('finance', 'admin:access'), ('finance', 'users:read'), ('finance', 'plans:manage'), ('finance', 'subscriptions:read'),
  ('finance', 'subscriptions:override'), ('finance', 'payments:read'), ('finance', 'payments:reconcile'), ('finance', 'audit:read'),
  ('moderator', 'admin:access'), ('moderator', 'users:read'), ('moderator', 'moderation:act'), ('moderator', 'creators:review'),
  ('support', 'admin:access'), ('support', 'users:read'), ('support', 'subscriptions:read'), ('support', 'payments:read'),
  ('content_editor', 'admin:access'), ('content_editor', 'chronicles:edit'),
  ('medical_reviewer', 'admin:access'), ('medical_reviewer', 'chronicles:edit'), ('medical_reviewer', 'chronicles:review');

create or replace function app_private.staff_can(p_permission text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.platform_roles pr
    join app_private.role_permissions rp on rp.role = pr.role
    where pr.profile_id = auth.uid() and rp.permission = p_permission
  );
$$;

-- ---------------------------------------------------------------------------
-- 2. Profiles
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column phone                 text,
  add column terms_version         text,
  add column privacy_version       text,
  add column terms_accepted_at     timestamptz,
  add column profile_completed_at  timestamptz,
  add column preferences           jsonb not null default '{"playbackSpeed": 1, "autoplayNext": true, "dataSaver": true}',
  add column email_preferences     jsonb not null default '{"episode_published": false, "renewal_reminder": true}',
  add column deletion_requested_at timestamptz,
  add column suspended_reason      text,
  add constraint profiles_phone_format check (phone is null or phone ~ '^\+?[0-9]{9,16}$'),
  add constraint profiles_preferences_object check (jsonb_typeof(preferences) = 'object' and jsonb_typeof(email_preferences) = 'object'),
  add constraint profiles_bio_len check (bio is null or char_length(bio) <= 600);

-- Users edit their own presentation and preferences; never status, roles, terms or deletion fields.
grant update (phone, country_code, preferences, email_preferences, profile_completed_at) on public.profiles to authenticated;

-- Signup provisioning: user-controlled metadata may only suggest a display name,
-- which is trimmed and length-limited. Roles never come from metadata.
create or replace function app_private.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_name text;
begin
  if new.is_anonymous = true then
    return new;
  end if;
  v_name := left(btrim(regexp_replace(coalesce(new.raw_user_meta_data ->> 'display_name', ''), '[[:cntrl:]]', '', 'g')), 80);
  if char_length(v_name) < 1 then
    v_name := 'Listener';
  end if;
  insert into public.profiles (id, display_name, is_anonymous) values (new.id, v_name, false)
  on conflict (id) do nothing;
  insert into public.notification_preferences (profile_id) values (new.id)
  on conflict (profile_id) do nothing;
  return new;
end;
$$;

/** Records acceptance of the CURRENT policy versions (from platform settings, not from the caller). */
create or replace function public.accept_current_terms(p_marketing boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;
  update public.profiles p
     set terms_version     = (select value #>> '{}' from public.platform_settings where key = 'policy.terms_version'),
         privacy_version   = (select value #>> '{}' from public.platform_settings where key = 'policy.privacy_version'),
         terms_accepted_at = now(),
         marketing_consent = coalesce(p_marketing, false),
         updated_at        = now()
   where p.id = auth.uid();
end;
$$;

create or replace function public.request_account_deletion()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;
  update public.profiles set deletion_requested_at = coalesce(deletion_requested_at, now()), updated_at = now() where id = auth.uid();
  insert into public.audit_logs (actor_profile_id, action, entity_type, entity_id)
  values (auth.uid(), 'account.deletion_requested', 'profiles', auth.uid());
end;
$$;

insert into public.platform_settings (key, value, description) values
  ('policy.terms_version',   '"2026-11-draft"', 'Current terms of use version accepted at signup.'),
  ('policy.privacy_version', '"2026-11-draft"', 'Current privacy notice version accepted at signup.')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Listening history and saved episodes
-- ---------------------------------------------------------------------------
create table public.mc_listening_events (
  id                    uuid primary key default gen_random_uuid(),
  profile_id            uuid not null references public.profiles (id) on delete cascade,
  episode_id            uuid not null references public.mc_episodes (id) on delete cascade,
  started_at            timestamptz not null default now(),
  last_position_seconds integer not null default 0,
  duration_seconds      integer,
  control               text not null,
  constraint mc_listening_events_position check (last_position_seconds between 0 and 86400),
  constraint mc_listening_events_control check (control in ('sonara', 'provider'))
);
create index mc_listening_events_profile_idx on public.mc_listening_events (profile_id, started_at desc);
create index mc_listening_events_episode_idx on public.mc_listening_events (episode_id);

create table public.mc_saved_episodes (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  episode_id uuid not null references public.mc_episodes (id) on delete cascade,
  saved_at   timestamptz not null default now(),
  primary key (profile_id, episode_id)
);

-- ---------------------------------------------------------------------------
-- 4. Email delivery log
-- ---------------------------------------------------------------------------
create table public.email_deliveries (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid references public.profiles (id) on delete set null,
  to_email        text not null,
  kind            text not null,
  subject         text not null,
  provider        text not null,
  status          text not null default 'queued',
  attempts        integer not null default 0,
  last_error      text,
  body            text,
  next_attempt_at timestamptz,
  created_at      timestamptz not null default now(),
  sent_at         timestamptz,
  constraint email_deliveries_status check (status in ('queued', 'sent', 'failed', 'suppressed', 'logged')),
  -- Authentication links are never stored, in any environment.
  constraint email_deliveries_no_auth_links check (kind not in ('email_verification', 'password_reset') or body is null)
);
create index email_deliveries_recent_idx on public.email_deliveries (created_at desc);
create index email_deliveries_retry_idx on public.email_deliveries (next_attempt_at) where status = 'failed';

-- ---------------------------------------------------------------------------
-- 5. Rate limiter (keys are hashed by the caller; no emails or IPs stored in clear)
-- ---------------------------------------------------------------------------
create table app_private.rate_limits (
  key          text primary key,
  window_start timestamptz not null,
  hits         integer not null
);

create or replace function app_private.rate_limit_hit(p_key text, p_max integer, p_window_seconds integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_hits integer;
begin
  insert into app_private.rate_limits as r (key, window_start, hits) values (p_key, now(), 1)
  on conflict (key) do update set
    hits = case when r.window_start < now() - make_interval(secs => p_window_seconds) then 1 else r.hits + 1 end,
    window_start = case when r.window_start < now() - make_interval(secs => p_window_seconds) then now() else r.window_start end
  returning hits into v_hits;
  return v_hits <= p_max;
end;
$$;

create or replace function app_private.rate_limit_prune()
returns integer language sql security definer set search_path = '' as $$
  with gone as (delete from app_private.rate_limits where window_start < now() - interval '1 day' returning 1)
  select count(*)::integer from gone;
$$;

-- ---------------------------------------------------------------------------
-- 6. Audit log: reason, hash chain, staff RPC, verifier
-- ---------------------------------------------------------------------------
alter table public.audit_logs
  add column reason    text,
  add column prev_hash text,
  add column hash      text;

create or replace function app_private.audit_digest(p_prev text, r public.audit_logs)
returns text language sql immutable set search_path = '' as $$
  select encode(pg_catalog.sha256(convert_to(concat_ws('|',
    p_prev, coalesce(r.actor_profile_id::text, ''), coalesce(r.actor_role, ''), r.action, r.entity_type,
    coalesce(r.entity_id::text, ''), coalesce(r.before::text, ''), coalesce(r.after::text, ''), coalesce(r.reason, ''),
    coalesce(r.request_id, ''), to_char(r.occurred_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US')
  ), 'UTF8')), 'hex');
$$;

create or replace function app_private.audit_chain()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_prev text;
begin
  -- Serialise appends so every record links to exactly one predecessor.
  perform pg_advisory_xact_lock(7314001);
  select a.hash into v_prev from public.audit_logs a where a.hash is not null order by a.id desc limit 1;
  new.prev_hash := coalesce(v_prev, 'genesis');
  new.hash := app_private.audit_digest(new.prev_hash, new);
  return new;
end;
$$;

-- Backfill existing rows in order, then chain every new row. The append-only
-- guard (0090) refuses UPDATE, so the table owner suspends it for this one-time
-- backfill inside the migration transaction and restores it immediately.
alter table public.audit_logs disable trigger audit_logs_append_only;
do $$
declare
  r public.audit_logs;
  v_prev text := 'genesis';
begin
  for r in select * from public.audit_logs order by id loop
    update public.audit_logs set prev_hash = v_prev, hash = app_private.audit_digest(v_prev, r) where id = r.id
    returning hash into v_prev;
  end loop;
end $$;
alter table public.audit_logs enable trigger audit_logs_append_only;

create trigger audit_logs_chain before insert on public.audit_logs
  for each row execute function app_private.audit_chain();

create or replace function public.record_audit_event(
  p_action text, p_entity_type text, p_entity_id uuid, p_before jsonb, p_after jsonb, p_reason text, p_request_id text
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not app_private.staff_can('admin:access') then
    raise exception 'only staff can record audit events' using errcode = '42501';
  end if;
  if p_action !~ '^[a-z][a-z0-9_.]{2,80}$' then
    raise exception 'invalid audit action';
  end if;
  insert into public.audit_logs (actor_profile_id, actor_role, action, entity_type, entity_id, before, after, reason, request_id)
  values (
    auth.uid(),
    (select string_agg(role::text, ',' order by role) from public.platform_roles where profile_id = auth.uid()),
    p_action, p_entity_type, p_entity_id, p_before, p_after, left(p_reason, 1000), left(p_request_id, 80)
  );
end;
$$;

create or replace function public.verify_audit_chain()
returns table (ok boolean, checked bigint, broken_at bigint)
language plpgsql stable security definer set search_path = '' as $$
declare
  r public.audit_logs;
  v_prev text := 'genesis';
  v_count bigint := 0;
begin
  if not app_private.staff_can('audit:read') then
    raise exception 'only staff with audit access can verify the log' using errcode = '42501';
  end if;
  for r in select * from public.audit_logs where hash is not null order by id loop
    v_count := v_count + 1;
    if r.prev_hash is distinct from v_prev or r.hash is distinct from app_private.audit_digest(v_prev, r) then
      return query select false, v_count, r.id;
      return;
    end if;
    v_prev := r.hash;
  end loop;
  return query select true, v_count, null::bigint;
end;
$$;

-- Audit readers: anyone whose role carries audit:read (was: admins only).
drop policy if exists audit_logs_admin_read on public.audit_logs;
create policy audit_logs_staff_read on public.audit_logs for select to authenticated using (app_private.staff_can('audit:read'));

-- ---------------------------------------------------------------------------
-- 7. Staff user directory, own sessions, public source summary
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_users()
returns table (
  id uuid, email text, display_name text, status public.account_status, roles public.platform_role[],
  created_at timestamptz, email_confirmed_at timestamptz, deletion_requested_at timestamptz, banned_until timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app_private.staff_can('users:read') then
    raise exception 'staff with users:read only' using errcode = '42501';
  end if;
  return query
    select p.id, u.email::text, p.display_name, p.status,
           coalesce(array_agg(r.role order by r.role) filter (where r.role is not null), '{}'::public.platform_role[]),
           p.created_at, u.email_confirmed_at, p.deletion_requested_at, u.banned_until
    from public.profiles p
    join auth.users u on u.id = p.id
    left join public.platform_roles r on r.profile_id = p.id
    group by p.id, u.email, u.email_confirmed_at, u.banned_until;
end;
$$;

create or replace function public.my_sessions()
returns table (id uuid, created_at timestamptz, updated_at timestamptz, user_agent text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;
  return query
    select s.id, s.created_at, s.updated_at, s.user_agent
    from auth.sessions s
    where s.user_id = auth.uid() and (s.not_after is null or s.not_after > now())
    order by s.updated_at desc;
end;
$$;

create or replace function public.mc_public_source_info()
returns table (episode_id uuid, kind public.mc_source_kind, status public.mc_source_status, status_note text)
language sql stable security definer set search_path = '' as $$
  select s.episode_id, s.kind, s.status, s.status_note
  from public.mc_episode_sources s
  where app_private.mc_episode_is_public(s.episode_id) or app_private.can_edit_chronicles();
$$;

-- ---------------------------------------------------------------------------
-- 8. Payments: Flutterwave-generated references for recurring card charges
-- ---------------------------------------------------------------------------
alter table public.payment_transactions add column provider_tx_ref text;
create index payment_transactions_provider_tx_ref_idx on public.payment_transactions (provider_tx_ref) where provider_tx_ref is not null;

-- ---------------------------------------------------------------------------
-- 9. RLS for new tables and an explicit privilege reset
-- ---------------------------------------------------------------------------
alter table public.mc_listening_events enable row level security;
alter table public.mc_saved_episodes   enable row level security;
alter table public.email_deliveries    enable row level security;
alter table app_private.role_permissions enable row level security;
alter table app_private.rate_limits      enable row level security;

create policy mc_listening_own_read on public.mc_listening_events for select to authenticated using (profile_id = auth.uid());
-- A listener can only record listening for an episode they are allowed to hear.
create policy mc_listening_own_insert on public.mc_listening_events for insert to authenticated
  with check (profile_id = auth.uid() and app_private.can_access_mc_episode(episode_id));
create policy mc_listening_own_update on public.mc_listening_events for update to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

create policy mc_saved_own_read on public.mc_saved_episodes for select to authenticated using (profile_id = auth.uid());
create policy mc_saved_own_insert on public.mc_saved_episodes for insert to authenticated
  with check (profile_id = auth.uid() and (app_private.mc_episode_is_public(episode_id) or app_private.can_edit_chronicles()));
create policy mc_saved_own_delete on public.mc_saved_episodes for delete to authenticated using (profile_id = auth.uid());

create policy email_deliveries_staff_read on public.email_deliveries for select to authenticated using (app_private.staff_can('audit:read'));

-- Every table created since 0120 (plus the new ones): revoke everything from
-- client roles, then grant exactly what the policies were written for.
do $$
declare t text;
begin
  foreach t in array array[
    'platform_settings', 'subscription_plans', 'promo_codes', 'subscriptions', 'payment_transactions',
    'subscription_payments', 'payment_webhook_events', 'refund_requests', 'entitlement_overrides',
    'mc_categories', 'mc_series', 'mc_episodes', 'mc_episode_sources', 'mc_episode_versions',
    'mc_editorial_events', 'mc_corrections', 'creator_applications', 'notifications',
    'mc_listening_events', 'mc_saved_episodes', 'email_deliveries'
  ] loop
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
end $$;
revoke all on table app_private.role_permissions, app_private.rate_limits from public, anon, authenticated;

grant select on public.platform_settings, public.subscription_plans to anon, authenticated;
grant update (value) on public.platform_settings to authenticated;
grant insert, update on public.subscription_plans to authenticated;
grant select on public.subscriptions, public.payment_transactions, public.subscription_payments,
                public.entitlement_overrides, public.refund_requests, public.payment_webhook_events to authenticated;
grant select, insert, update on public.promo_codes to authenticated;
grant insert on public.refund_requests to authenticated;

grant select on public.mc_categories, public.mc_series, public.mc_episodes, public.mc_corrections to anon, authenticated;
grant insert, update on public.mc_categories, public.mc_series, public.mc_episodes, public.mc_episode_sources to authenticated;
grant select on public.mc_episode_sources, public.mc_episode_versions, public.mc_editorial_events to authenticated;
grant insert on public.mc_episode_versions, public.mc_editorial_events, public.mc_corrections to authenticated;

grant select, insert, update on public.creator_applications to authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

grant select, insert on public.mc_listening_events to authenticated;
grant update (last_position_seconds) on public.mc_listening_events to authenticated;
grant select, insert, delete on public.mc_saved_episodes to authenticated;
grant select on public.email_deliveries to authenticated;

-- Functions: nothing new is callable by the public by default.
revoke all on function app_private.staff_can(text), app_private.rate_limit_hit(text, integer, integer), app_private.rate_limit_prune(),
  app_private.audit_digest(text, public.audit_logs), app_private.audit_chain() from public, anon, authenticated;
grant execute on function app_private.staff_can(text) to authenticated, service_role;
grant execute on function app_private.rate_limit_hit(text, integer, integer), app_private.rate_limit_prune() to service_role;
-- Entitlement status of arbitrary users is not something clients may probe.
revoke all on function app_private.has_active_entitlement(uuid, public.plan_audience) from public, anon, authenticated;
grant execute on function app_private.has_active_entitlement(uuid, public.plan_audience) to service_role;

revoke all on function public.accept_current_terms(boolean), public.request_account_deletion(), public.record_audit_event(text, text, uuid, jsonb, jsonb, text, text),
  public.verify_audit_chain(), public.admin_list_users(), public.my_sessions(), public.mc_public_source_info() from public, anon;
grant execute on function public.accept_current_terms(boolean), public.request_account_deletion(), public.record_audit_event(text, text, uuid, jsonb, jsonb, text, text),
  public.verify_audit_chain(), public.admin_list_users(), public.my_sessions() to authenticated, service_role;
grant execute on function public.mc_public_source_info() to anon, authenticated, service_role;

-- Reversal (manual):
--   drop function public.mc_public_source_info(), public.my_sessions(), public.admin_list_users(),
--     public.verify_audit_chain(), public.record_audit_event(text, text, uuid, jsonb, jsonb, text, text),
--     public.request_account_deletion(), public.accept_current_terms(boolean);
--   drop trigger audit_logs_chain on public.audit_logs; drop function app_private.audit_chain(), app_private.audit_digest(text, public.audit_logs);
--   alter table public.audit_logs drop column hash, drop column prev_hash, drop column reason;
--   drop function app_private.rate_limit_prune(), app_private.rate_limit_hit(text, integer, integer); drop table app_private.rate_limits;
--   drop table public.email_deliveries, public.mc_saved_episodes, public.mc_listening_events;
--   alter table public.payment_transactions drop column provider_tx_ref;
--   alter table public.profiles drop column phone, ... (see section 2);
--   drop function app_private.staff_can(text); drop table app_private.role_permissions;
