-- =============================================================================
-- 0130 — Medical Chronicles
-- =============================================================================
-- Sonara-owned educational audio. Mirrors packages/chronicles:
--   * categories are data (admin-managed), not frontend constants;
--   * the first N publicly live episodes of a series are free (N per series,
--     default from platform_settings), episode overrides beat position;
--   * audio sources live in mc_episode_sources, which has NO public read path.
--     A listener obtains a source only through mc_episode_playback(), which
--     applies the access rule inside the database;
--   * editorial workflow with no self-approval, enforced by trigger;
--   * every content change is versioned and audited; corrections are public.
--
-- Reversal: drop the objects listed at the bottom, in that order.
-- =============================================================================

create type public.mc_editorial_status as enum ('draft', 'in_review', 'changes_requested', 'approved', 'published', 'withdrawn');
create type public.mc_ai_disclosure as enum ('human_produced', 'ai_assisted', 'ai_generated');
create type public.mc_access_override as enum ('inherit', 'free', 'premium');
create type public.mc_source_kind as enum ('notebooklm_link', 'uploaded_audio', 'authorised_url');
create type public.mc_source_status as enum ('active', 'unavailable', 'withdrawn');

create or replace function app_private.can_edit_chronicles()
returns boolean language sql stable security definer set search_path = '' as $$
  select app_private.has_platform_role(array['super_admin', 'admin', 'content_editor', 'medical_reviewer']::public.platform_role[]);
$$;

create or replace function app_private.can_review_chronicles()
returns boolean language sql stable security definer set search_path = '' as $$
  select app_private.has_platform_role(array['super_admin', 'admin', 'medical_reviewer']::public.platform_role[]);
$$;

-- ---------------------------------------------------------------------------
-- Categories
-- ---------------------------------------------------------------------------
create table public.mc_categories (
  id          uuid primary key default gen_random_uuid(),
  slug        citext not null unique,
  name        text not null,
  description text,
  kind        text not null default 'topic',
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint mc_categories_slug_format check (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$'),
  constraint mc_categories_name_len check (char_length(name) between 2 and 80),
  constraint mc_categories_kind check (kind in ('topic', 'specialty'))
);

-- Initial vocabulary. Editable, re-orderable and deactivatable by administrators.
insert into public.mc_categories (slug, name, kind, sort_order) values
  ('anatomy',                  'Anatomy',                  'topic',     10),
  ('physiology',               'Physiology',               'topic',     20),
  ('pathology',                'Pathology',                'topic',     30),
  ('pharmacology',             'Pharmacology',             'topic',     40),
  ('microbiology',             'Microbiology',             'topic',     50),
  ('internal-medicine',        'Internal Medicine',        'specialty', 60),
  ('surgery',                  'Surgery',                  'specialty', 70),
  ('paediatrics',              'Paediatrics',              'specialty', 80),
  ('obstetrics-and-gynaecology','Obstetrics and Gynaecology','specialty', 90),
  ('community-medicine',       'Community Medicine',       'specialty', 100),
  ('clinical-skills',          'Clinical Skills',          'topic',     110),
  ('emergency-medicine',       'Emergency Medicine',       'specialty', 120),
  ('public-health',            'Public Health',            'topic',     130),
  ('medical-research',         'Medical Research',         'topic',     140);

-- ---------------------------------------------------------------------------
-- Series
-- ---------------------------------------------------------------------------
create table public.mc_series (
  id                      uuid primary key default gen_random_uuid(),
  slug                    citext not null unique,
  title                   text not null,
  description             text not null default '',
  cover_asset_id          uuid references public.media_assets (id) on delete set null,
  category_id             uuid references public.mc_categories (id) on delete restrict,
  specialty_id            uuid references public.mc_categories (id) on delete restrict,
  editor_display          text,
  host_display            text,
  status                  text not null default 'draft',
  requires_subscription   boolean not null default true,
  free_episode_allowance  integer,
  published_at            timestamptz,
  seo_title               text,
  seo_description         text,
  related_series_ids      uuid[] not null default '{}',
  created_by              uuid references public.profiles (id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint mc_series_slug_format check (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$'),
  constraint mc_series_title_len check (char_length(title) between 2 and 200),
  constraint mc_series_status check (status in ('draft', 'published', 'archived')),
  constraint mc_series_allowance_range check (free_episode_allowance is null or free_episode_allowance between 0 and 500),
  constraint mc_series_published_requires_timestamp check (status <> 'published' or published_at is not null)
);

create index mc_series_public_idx on public.mc_series (published_at desc) where status = 'published';
create index mc_series_category_idx on public.mc_series (category_id);

create or replace function app_private.mc_series_is_public(p_series_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.mc_series s where s.id = p_series_id and s.status = 'published' and s.published_at <= now());
$$;

-- ---------------------------------------------------------------------------
-- Episodes
-- ---------------------------------------------------------------------------
create table public.mc_episodes (
  id                     uuid primary key default gen_random_uuid(),
  series_id              uuid not null references public.mc_series (id) on delete cascade,
  slug                   citext not null unique,
  title                  text not null,
  description            text not null default '',
  season                 integer,
  episode_number         integer,
  cover_asset_id         uuid references public.media_assets (id) on delete set null,
  duration_seconds       integer,
  transcript             text,
  content_notes          text,
  reference_list         jsonb not null default '[]',
  ai_disclosure          public.mc_ai_disclosure,
  access_override        public.mc_access_override not null default 'inherit',
  download_allowed       boolean not null default false,
  status                 public.mc_editorial_status not null default 'draft',
  version                integer not null default 1,
  submitted_by           uuid references public.profiles (id) on delete set null,
  submitted_at           timestamptz,
  last_edited_by         uuid references public.profiles (id) on delete set null,
  approved_version       integer,
  approved_by            uuid references public.profiles (id) on delete set null,
  approved_at            timestamptz,
  published_at           timestamptz,
  withdrawn_at           timestamptz,
  withdrawn_reason       text,
  last_reviewed_at       timestamptz,
  last_reviewed_by       uuid references public.profiles (id) on delete set null,
  related_episode_ids    uuid[] not null default '{}',
  created_by             uuid references public.profiles (id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint mc_episodes_slug_format check (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$'),
  constraint mc_episodes_title_len check (char_length(title) between 2 and 300),
  constraint mc_episodes_numbers check ((season is null or season between 1 and 999) and (episode_number is null or episode_number between 0 and 99999)),
  constraint mc_episodes_duration check (duration_seconds is null or duration_seconds between 0 and 86400),
  constraint mc_episodes_references_array check (jsonb_typeof(reference_list) = 'array'),
  constraint mc_episodes_published_requires_timestamp check (status <> 'published' or published_at is not null),
  -- Published content always carries an approval. That the approval covers the
  -- *current* version at publish time is checked by guard_mc_episode(), because
  -- a later public correction legitimately bumps the version while staying live.
  constraint mc_episodes_published_requires_approval check (
    status <> 'published' or (approved_by is not null and approved_version is not null and approved_version <= version)
  ),
  constraint mc_episodes_no_self_approval check (
    approved_by is null or (approved_by is distinct from submitted_by and approved_by is distinct from last_edited_by)
  ),
  constraint mc_episodes_withdrawn_has_reason check (status <> 'withdrawn' or (withdrawn_at is not null and char_length(coalesce(withdrawn_reason, '')) >= 3)),
  constraint mc_episodes_ordering_unique unique (series_id, season, episode_number)
);

create index mc_episodes_series_order_idx on public.mc_episodes (series_id, season, episode_number, published_at);
create index mc_episodes_public_idx on public.mc_episodes (published_at desc) where status = 'published';

create or replace function app_private.mc_episode_is_public(p_episode_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.mc_episodes e
    where e.id = p_episode_id and e.status = 'published' and e.published_at <= now()
      and app_private.mc_series_is_public(e.series_id)
  );
$$;

-- Audio sources: separate so premium links are never selectable by the public.
create table public.mc_episode_sources (
  episode_id   uuid primary key references public.mc_episodes (id) on delete cascade,
  kind         public.mc_source_kind not null,
  url          text,
  asset_id     uuid references public.media_assets (id) on delete restrict,
  provider_ref text,
  status       public.mc_source_status not null default 'active',
  status_note  text,
  checked_at   timestamptz,
  created_by   uuid references public.profiles (id) on delete set null,
  updated_at   timestamptz not null default now(),
  constraint mc_episode_sources_shape check (
    (kind = 'uploaded_audio' and asset_id is not null and url is null)
    or (kind <> 'uploaded_audio' and url is not null and asset_id is null)
  ),
  constraint mc_episode_sources_https check (url is null or url ~ '^https://[^\s@/]+/'),
  -- Same rule as parseNotebookLmLink(): exact host, /notebook/<id>.
  constraint mc_episode_sources_notebooklm check (
    kind <> 'notebooklm_link'
    or url ~ '^https://notebooklm\.google\.com/notebook/[A-Za-z0-9_-]{6,128}(/[a-z-]{1,20})?(\?[^\s#]*)?$'
  )
);

create table public.mc_episode_versions (
  id          bigint generated always as identity primary key,
  episode_id  uuid not null references public.mc_episodes (id) on delete cascade,
  version     integer not null,
  snapshot    jsonb not null,
  change_note text,
  edited_by   uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  constraint mc_episode_versions_unique unique (episode_id, version)
);

create table public.mc_editorial_events (
  id          bigint generated always as identity primary key,
  episode_id  uuid not null references public.mc_episodes (id) on delete cascade,
  actor_id    uuid references public.profiles (id) on delete set null,
  action      text not null,
  from_status public.mc_editorial_status,
  to_status   public.mc_editorial_status,
  version     integer not null,
  note        text,
  created_at  timestamptz not null default now()
);

create index mc_editorial_events_episode_idx on public.mc_editorial_events (episode_id, created_at desc);

create table public.mc_corrections (
  id          uuid primary key default gen_random_uuid(),
  episode_id  uuid not null references public.mc_episodes (id) on delete cascade,
  version     integer not null,
  summary     text not null,
  corrected_by uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  constraint mc_corrections_summary_len check (char_length(summary) between 5 and 2000)
);

-- ---------------------------------------------------------------------------
-- Editorial guard (defence in depth behind packages/chronicles/editorial.ts)
-- ---------------------------------------------------------------------------
create or replace function app_private.guard_mc_episode()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  -- Applies to every writer, trusted or not.
  if new.status = 'published' and (tg_op = 'INSERT' or old.status <> 'published')
     and new.approved_version is distinct from new.version then
    raise exception 'stale approval: the episode changed after it was approved';
  end if;
  if current_user not in ('anon', 'authenticated') then
    return new; -- service_role / migrations / audited RPCs
  end if;
  if not app_private.can_edit_chronicles() then
    raise exception 'Medical Chronicles editing requires an editor role' using errcode = '42501';
  end if;
  new.last_edited_by := auth.uid();

  if tg_op = 'INSERT' then
    if new.status <> 'draft' or new.approved_by is not null or new.published_at is not null then
      raise exception 'a new episode starts as an unapproved draft';
    end if;
    return new;
  end if;

  -- Approval fields can only be set by a reviewer, as themselves.
  if new.approved_by is distinct from old.approved_by and new.approved_by is not null then
    if not app_private.can_review_chronicles() or new.approved_by <> auth.uid() then
      raise exception 'only a reviewer can approve, and only as themselves' using errcode = '42501';
    end if;
    if old.last_edited_by = auth.uid() or old.submitted_by = auth.uid() then
      raise exception 'self-approval is not permitted' using errcode = '42501';
    end if;
    -- The reviewer's own save must not make them the last editor.
    new.last_edited_by := old.last_edited_by;
  end if;
  if new.status in ('approved', 'published', 'withdrawn') and new.status is distinct from old.status then
    if not app_private.can_review_chronicles() then
      raise exception 'only a reviewer can approve, publish or withdraw' using errcode = '42501';
    end if;
    if new.status <> 'withdrawn' and (old.last_edited_by = auth.uid() or old.submitted_by = auth.uid()) then
      raise exception 'self-approval is not permitted' using errcode = '42501';
    end if;
    new.last_edited_by := old.last_edited_by;
  end if;
  if new.version < old.version then
    raise exception 'version cannot go backwards';
  end if;
  return new;
end;
$$;

create trigger mc_episodes_guard before insert or update on public.mc_episodes
  for each row execute function app_private.guard_mc_episode();

create trigger mc_categories_updated_at before update on public.mc_categories for each row execute function app_private.set_updated_at();
create trigger mc_series_updated_at before update on public.mc_series for each row execute function app_private.set_updated_at();
create trigger mc_episodes_updated_at before update on public.mc_episodes for each row execute function app_private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Access rule, in SQL (same as packages/chronicles/src/access.ts)
-- ---------------------------------------------------------------------------
create or replace function app_private.mc_episode_tier(p_episode_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  with target as (
    select e.id, e.series_id, e.access_override, s.requires_subscription,
           coalesce(s.free_episode_allowance, app_private.setting_int('chronicles.default_free_episode_allowance', 2)) as allowance
    from public.mc_episodes e join public.mc_series s on s.id = e.series_id
    where e.id = p_episode_id
  ),
  ordered as (
    select e.id, row_number() over (
      order by coalesce(e.season, 1), coalesce(e.episode_number, 2147483647), e.published_at, e.id
    ) as position
    from public.mc_episodes e, target t
    where e.series_id = t.series_id and e.status = 'published' and e.published_at <= now()
  )
  select case
    when t.requires_subscription = false then 'free'
    when t.access_override = 'free' then 'free'
    when t.access_override = 'premium' then 'premium'
    when exists (select 1 from ordered o where o.id = t.id and o.position <= t.allowance) then 'free'
    else 'premium'
  end
  from target t;
$$;

create or replace function app_private.can_access_mc_episode(p_episode_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select case
    when app_private.can_edit_chronicles() then true -- staff preview
    when not app_private.mc_episode_is_public(p_episode_id) then false
    when app_private.mc_episode_tier(p_episode_id) = 'free'
      then (auth.uid() is not null or not app_private.setting_bool('chronicles.free_requires_account', false))
    else app_private.has_active_entitlement(auth.uid(), 'listener')
  end;
$$;

/**
 * The only way a listener reaches an episode's audio source. Returns nothing
 * when access is denied; the caller shows the paywall. Uploaded audio returns
 * the asset id, which the media service exchanges for a short-lived signed URL.
 */
create or replace function public.mc_episode_playback(p_episode_id uuid)
returns table (kind public.mc_source_kind, url text, asset_id uuid, status public.mc_source_status, tier text)
language sql stable security definer set search_path = '' as $$
  select s.kind, s.url, s.asset_id, s.status, app_private.mc_episode_tier(p_episode_id)
  from public.mc_episode_sources s
  where s.episode_id = p_episode_id
    and app_private.can_access_mc_episode(p_episode_id)
    and (s.status = 'active' or app_private.can_edit_chronicles());
$$;

/** Public tier for display (lock icons). Never reveals the source. */
create or replace function public.mc_episode_access(p_episode_id uuid)
returns table (tier text, allowed boolean)
language sql stable security definer set search_path = '' as $$
  select app_private.mc_episode_tier(p_episode_id), app_private.can_access_mc_episode(p_episode_id)
  where app_private.mc_episode_is_public(p_episode_id) or app_private.can_edit_chronicles();
$$;

-- ---------------------------------------------------------------------------
-- Privileges and RLS
-- ---------------------------------------------------------------------------
grant execute on function app_private.can_edit_chronicles(), app_private.can_review_chronicles(),
  app_private.mc_series_is_public(uuid), app_private.mc_episode_is_public(uuid),
  app_private.mc_episode_tier(uuid), app_private.can_access_mc_episode(uuid) to anon, authenticated, service_role;
grant execute on function public.mc_episode_playback(uuid), public.mc_episode_access(uuid) to anon, authenticated, service_role;

grant select on public.mc_categories, public.mc_series, public.mc_episodes, public.mc_corrections to anon, authenticated;
grant insert, update on public.mc_categories, public.mc_series, public.mc_episodes, public.mc_episode_sources to authenticated;
grant select on public.mc_episode_sources, public.mc_episode_versions, public.mc_editorial_events to authenticated;
grant insert on public.mc_episode_versions, public.mc_editorial_events, public.mc_corrections to authenticated;
grant usage on all sequences in schema public to authenticated;
grant all on public.mc_categories, public.mc_series, public.mc_episodes, public.mc_episode_sources,
             public.mc_episode_versions, public.mc_editorial_events, public.mc_corrections to service_role;
-- Withdrawal, not deletion: nobody deletes medical content from a client session.
revoke delete on public.mc_series, public.mc_episodes, public.mc_corrections, public.mc_episode_versions, public.mc_editorial_events from authenticated;

alter table public.mc_categories       enable row level security;
alter table public.mc_series           enable row level security;
alter table public.mc_episodes         enable row level security;
alter table public.mc_episode_sources  enable row level security;
alter table public.mc_episode_versions enable row level security;
alter table public.mc_editorial_events enable row level security;
alter table public.mc_corrections      enable row level security;

create policy mc_categories_read on public.mc_categories for select using (is_active or app_private.can_edit_chronicles());
create policy mc_categories_admin_insert on public.mc_categories for insert to authenticated with check (app_private.is_platform_admin());
create policy mc_categories_admin_update on public.mc_categories for update to authenticated
  using (app_private.is_platform_admin()) with check (app_private.is_platform_admin());

create policy mc_series_read on public.mc_series for select
  using ((status = 'published' and published_at <= now()) or app_private.can_edit_chronicles());
create policy mc_series_editor_insert on public.mc_series for insert to authenticated
  with check (app_private.can_edit_chronicles() and (status = 'draft' or app_private.can_review_chronicles()));
create policy mc_series_editor_update on public.mc_series for update to authenticated
  using (app_private.can_edit_chronicles())
  with check (app_private.can_edit_chronicles() and (status = 'draft' or app_private.can_review_chronicles()));

create policy mc_episodes_read on public.mc_episodes for select
  using (app_private.mc_episode_is_public(id) or app_private.can_edit_chronicles());
create policy mc_episodes_editor_insert on public.mc_episodes for insert to authenticated
  with check (app_private.can_edit_chronicles());
create policy mc_episodes_editor_update on public.mc_episodes for update to authenticated
  using (app_private.can_edit_chronicles()) with check (app_private.can_edit_chronicles());

-- No public select policy on sources: listeners go through mc_episode_playback().
create policy mc_episode_sources_editor_all on public.mc_episode_sources for all to authenticated
  using (app_private.can_edit_chronicles()) with check (app_private.can_edit_chronicles());

create policy mc_episode_versions_editor_read on public.mc_episode_versions for select to authenticated using (app_private.can_edit_chronicles());
create policy mc_episode_versions_editor_insert on public.mc_episode_versions for insert to authenticated
  with check (app_private.can_edit_chronicles() and edited_by = auth.uid());
create policy mc_editorial_events_editor_read on public.mc_editorial_events for select to authenticated using (app_private.can_edit_chronicles());
create policy mc_editorial_events_editor_insert on public.mc_editorial_events for insert to authenticated
  with check (app_private.can_edit_chronicles() and actor_id = auth.uid());

-- Corrections are public for live episodes so listeners can see what changed.
create policy mc_corrections_read on public.mc_corrections for select
  using (app_private.mc_episode_is_public(episode_id) or app_private.can_edit_chronicles());
create policy mc_corrections_editor_insert on public.mc_corrections for insert to authenticated
  with check (app_private.can_edit_chronicles() and corrected_by = auth.uid());

do $$
declare t text;
begin
  foreach t in array array['mc_categories', 'mc_series', 'mc_episodes', 'mc_episode_sources']
  loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function app_private.audit_row_change()', t || '_audit', t);
  end loop;
end $$;

-- Reversal (manual):
--   drop function public.mc_episode_access(uuid), public.mc_episode_playback(uuid),
--     app_private.can_access_mc_episode(uuid), app_private.mc_episode_tier(uuid),
--     app_private.guard_mc_episode(), app_private.mc_episode_is_public(uuid), app_private.mc_series_is_public(uuid);
--   drop table public.mc_corrections, public.mc_editorial_events, public.mc_episode_versions,
--     public.mc_episode_sources, public.mc_episodes, public.mc_series, public.mc_categories;
--   drop function app_private.can_review_chronicles(), app_private.can_edit_chronicles();
--   drop type public.mc_source_status, public.mc_source_kind, public.mc_access_override,
--     public.mc_ai_disclosure, public.mc_editorial_status;
