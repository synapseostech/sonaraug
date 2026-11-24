-- =============================================================================
-- 0120 — Platform settings, subscription plans, subscriptions, payments,
--        webhook deliveries, refunds and entitlement overrides
-- =============================================================================
-- Security model:
--   * Listeners READ their own subscriptions and transactions. They never write
--     them. Only the payment processor (service_role, after re-verifying the
--     transaction with Flutterwave) changes payment or subscription state.
--   * Not even a platform admin can mark a transaction successful from a client
--     session. Manual access corrections go through grant_entitlement_override(),
--     which requires a reason and writes an audit row.
--   * Listener and creator products are separate audiences end to end.
--
-- Reversal: drop the objects in reverse order of creation (see bottom).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function app_private.has_platform_role(p_roles public.platform_role[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.platform_roles pr
    where pr.profile_id = auth.uid() and pr.role = any (p_roles)
  );
$$;

comment on function app_private.has_platform_role(public.platform_role[]) is
  'True when the caller holds any of the given platform roles.';

create or replace function app_private.is_finance()
returns boolean language sql stable security definer set search_path = '' as $$
  select app_private.has_platform_role(array['super_admin', 'admin', 'finance']::public.platform_role[]);
$$;

create or replace function app_private.can_read_billing()
returns boolean language sql stable security definer set search_path = '' as $$
  select app_private.has_platform_role(array['super_admin', 'admin', 'finance', 'support']::public.platform_role[]);
$$;

-- ---------------------------------------------------------------------------
-- Platform settings (key/value, admin-managed, audited)
-- ---------------------------------------------------------------------------
create table public.platform_settings (
  key          text primary key,
  value        jsonb not null,
  description  text,
  is_sensitive boolean not null default false,
  updated_by   uuid references public.profiles (id) on delete set null,
  updated_at   timestamptz not null default now(),
  constraint platform_settings_key_format check (key ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$')
);

comment on table public.platform_settings is
  'Admin-configurable platform behaviour. Never holds secrets: credentials live in server environment variables.';

insert into public.platform_settings (key, value, description) values
  ('chronicles.default_free_episode_allowance', '2',        'Free episodes per Medical Chronicles series when the series does not set its own allowance.'),
  ('chronicles.free_requires_account',          'false',    'When true, even free episodes need a (free) account.'),
  ('billing.grace_days',                        '3',        'Days of continued access after a renewal is missed.'),
  ('billing.trials_enabled',                    'false',    'Plan trial days are honoured only when true. Off until approved.'),
  ('billing.default_currency',                  '"UGX"',    'Currency for new plans.'),
  ('billing.live_payments_enabled',             'false',    'Live Flutterwave charges. Must stay false until the owner approves and KYC is complete.'),
  ('platform.maintenance_mode',                 'false',    'Shows a maintenance notice and blocks checkout.'),
  ('platform.regions',                          '["UG"]',   'Countries where the service is offered.'),
  ('media.authorised_audio_hosts',              '[]',       'Hosts allowed for the "authorised audio URL" source type.');

-- ---------------------------------------------------------------------------
-- Plans
-- ---------------------------------------------------------------------------
create type public.plan_audience as enum ('listener', 'creator');
create type public.billing_interval as enum ('monthly', 'annual');
create type public.subscription_status as enum ('pending', 'active', 'past_due', 'expired');
create type public.payment_status as enum ('initiated', 'pending', 'successful', 'failed', 'reversed', 'mismatch');

create table public.subscription_plans (
  id                   uuid primary key default gen_random_uuid(),
  audience             public.plan_audience not null,
  code                 citext not null unique,
  name                 text not null,
  description          text not null default '',
  interval             public.billing_interval not null,
  amount               bigint not null,
  currency             char(3) not null default 'UGX',
  is_active            boolean not null default false,
  trial_days           integer not null default 0,
  features             jsonb not null default '[]',
  creator_limits       jsonb,
  provider_plan_id     text,
  price_is_placeholder boolean not null default true,
  sort_order           integer not null default 0,
  created_by           uuid references public.profiles (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint subscription_plans_code_format check (code ~ '^[a-z0-9][a-z0-9_-]{1,39}$'),
  constraint subscription_plans_amount_positive check (amount > 0),
  constraint subscription_plans_currency check (currency in ('UGX', 'KES', 'TZS', 'RWF', 'USD')),
  constraint subscription_plans_trial_range check (trial_days between 0 and 90),
  constraint subscription_plans_features_array check (jsonb_typeof(features) = 'array'),
  -- Creator capacity belongs to creator plans only; listener plans carry none.
  constraint subscription_plans_limits_by_audience check (
    (audience = 'creator' and creator_limits is not null and jsonb_typeof(creator_limits) = 'object')
    or (audience = 'listener' and creator_limits is null)
  )
);

create index subscription_plans_public_idx on public.subscription_plans (audience, sort_order) where is_active;

create table public.promo_codes (
  id               uuid primary key default gen_random_uuid(),
  code             citext not null unique,
  description      text not null default '',
  percent_off      integer,
  amount_off       bigint,
  currency         char(3),
  plan_ids         uuid[],
  valid_from       timestamptz,
  valid_until      timestamptz,
  max_redemptions  integer,
  redemptions      integer not null default 0,
  is_active        boolean not null default true,
  created_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  constraint promo_codes_code_format check (code ~ '^[A-Z0-9]{3,32}$'),
  constraint promo_codes_one_discount check (num_nonnulls(percent_off, amount_off) = 1),
  constraint promo_codes_percent_range check (percent_off is null or percent_off between 1 and 99),
  constraint promo_codes_amount_currency check (amount_off is null or (amount_off > 0 and currency is not null)),
  constraint promo_codes_window check (valid_until is null or valid_from is null or valid_until > valid_from),
  constraint promo_codes_redemptions check (redemptions >= 0 and (max_redemptions is null or redemptions <= max_redemptions))
);

-- ---------------------------------------------------------------------------
-- Subscriptions
-- ---------------------------------------------------------------------------
create table public.subscriptions (
  id                       uuid primary key default gen_random_uuid(),
  profile_id               uuid not null references public.profiles (id) on delete cascade,
  plan_id                  uuid not null references public.subscription_plans (id) on delete restrict,
  audience                 public.plan_audience not null,
  status                   public.subscription_status not null default 'pending',
  current_period_start     timestamptz,
  current_period_end       timestamptz,
  cancel_at_period_end     boolean not null default false,
  cancelled_at             timestamptz,
  renewal_mode             text not null default 'manual',
  provider_subscription_id text,
  is_trial                 boolean not null default false,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint subscriptions_renewal_mode check (renewal_mode in ('card_auto', 'manual')),
  constraint subscriptions_period_order check (current_period_end is null or current_period_end > current_period_start),
  constraint subscriptions_active_has_period check (status not in ('active', 'past_due') or current_period_end is not null)
);

-- One live subscription per person per product.
create unique index subscriptions_one_live_per_audience on public.subscriptions (profile_id, audience)
  where status in ('active', 'past_due');
create index subscriptions_profile_idx on public.subscriptions (profile_id, created_at desc);
create index subscriptions_renewal_idx on public.subscriptions (current_period_end) where status in ('active', 'past_due');

create or replace function app_private.subscription_audience_matches_plan()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.subscription_plans p where p.id = new.plan_id and p.audience = new.audience) then
    raise exception 'subscription audience must match its plan audience';
  end if;
  return new;
end;
$$;

create trigger subscriptions_audience_matches before insert or update of plan_id, audience on public.subscriptions
  for each row execute function app_private.subscription_audience_matches_plan();

-- ---------------------------------------------------------------------------
-- Payment transactions
-- ---------------------------------------------------------------------------
create table public.payment_transactions (
  id                       uuid primary key default gen_random_uuid(),
  tx_ref                   text not null unique,
  profile_id               uuid not null references public.profiles (id) on delete restrict,
  plan_id                  uuid not null references public.subscription_plans (id) on delete restrict,
  audience                 public.plan_audience not null,
  purpose                  text not null default 'new',
  amount                   bigint not null,
  currency                 char(3) not null,
  promo_code_id            uuid references public.promo_codes (id) on delete set null,
  status                   public.payment_status not null default 'initiated',
  provider                 text not null default 'flutterwave',
  environment              text not null,
  provider_transaction_id  text unique,
  provider_ref             text,
  payment_type             text,
  charged_amount           bigint,
  overpaid                 boolean not null default false,
  failure_reason           text,
  verified_at              timestamptz,
  subscription_id          uuid references public.subscriptions (id) on delete set null,
  refund_status            text not null default 'none',
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint payment_transactions_tx_ref_format check (tx_ref ~ '^SON-[A-F0-9]{16,48}$'),
  constraint payment_transactions_amount_positive check (amount > 0),
  constraint payment_transactions_purpose check (purpose in ('new', 'renewal')),
  constraint payment_transactions_environment check (environment in ('test', 'live', 'simulator')),
  constraint payment_transactions_provider check (provider = 'flutterwave'),
  constraint payment_transactions_refund_status check (refund_status in ('none', 'requested', 'processing', 'refunded', 'rejected')),
  -- A success is only ever recorded with the provider's id and a verification time.
  constraint payment_transactions_success_is_verified check (
    status not in ('successful', 'reversed') or (provider_transaction_id is not null and verified_at is not null)
  )
);

create index payment_transactions_profile_idx on public.payment_transactions (profile_id, created_at desc);
create index payment_transactions_status_idx on public.payment_transactions (status, created_at desc);

-- One transaction credits one subscription exactly once (webhook idempotency at the data layer).
create table public.subscription_payments (
  transaction_id  uuid primary key references public.payment_transactions (id) on delete restrict,
  subscription_id uuid not null references public.subscriptions (id) on delete cascade,
  period_start    timestamptz not null,
  period_end      timestamptz not null,
  applied_at      timestamptz not null default now()
);

create index subscription_payments_subscription_idx on public.subscription_payments (subscription_id);

create or replace function app_private.guard_payment_transaction()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  -- Payment state is written by the payment processor only. A client session,
  -- including a platform admin's, can never mark money as received.
  if current_user in ('anon', 'authenticated') then
    raise exception 'payment transactions are written by the payment processor only';
  end if;
  if tg_op = 'UPDATE' then
    if old.status = 'successful' and new.status not in ('successful', 'reversed') then
      raise exception 'a successful payment can only be reversed';
    end if;
    if old.status in ('mismatch', 'reversed') and new.status <> old.status then
      raise exception 'a % payment is final', old.status;
    end if;
    if new.amount <> old.amount or new.currency <> old.currency or new.tx_ref <> old.tx_ref or new.profile_id <> old.profile_id then
      raise exception 'expected amount, currency, reference and payer are immutable';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger payment_transactions_guard before insert or update on public.payment_transactions
  for each row execute function app_private.guard_payment_transaction();

-- ---------------------------------------------------------------------------
-- Webhook deliveries (every delivery, valid or not, is recorded)
-- ---------------------------------------------------------------------------
create table public.payment_webhook_events (
  id                      uuid primary key default gen_random_uuid(),
  provider                text not null default 'flutterwave',
  idempotency_key         text,
  event_type              text,
  provider_transaction_id text,
  tx_ref                  text,
  signature_valid         boolean not null,
  processing_status       text not null default 'received',
  error                   text,
  payload                 jsonb,
  received_at             timestamptz not null default now(),
  processed_at            timestamptz,
  attempts                integer not null default 1,
  constraint payment_webhook_events_status check (processing_status in ('received', 'processed', 'ignored', 'failed', 'rejected', 'duplicate')),
  -- Forged deliveries are kept for forensics but never with a usable key.
  constraint payment_webhook_events_key_only_when_signed check (signature_valid or idempotency_key is null)
);

create unique index payment_webhook_events_idempotency on public.payment_webhook_events (provider, idempotency_key)
  where idempotency_key is not null;
create index payment_webhook_events_recent_idx on public.payment_webhook_events (received_at desc);

-- ---------------------------------------------------------------------------
-- Refund requests
-- ---------------------------------------------------------------------------
create table public.refund_requests (
  id              uuid primary key default gen_random_uuid(),
  transaction_id  uuid not null references public.payment_transactions (id) on delete restrict,
  requested_by    uuid not null references public.profiles (id) on delete restrict,
  reason          text not null,
  amount          bigint,
  status          text not null default 'requested',
  decided_by      uuid references public.profiles (id) on delete set null,
  decided_at      timestamptz,
  decision_note   text,
  created_at      timestamptz not null default now(),
  constraint refund_requests_status check (status in ('requested', 'approved', 'rejected', 'processing', 'refunded')),
  constraint refund_requests_reason_len check (char_length(reason) between 5 and 2000),
  constraint refund_requests_decision check (status = 'requested' or decided_by is not null)
);

-- ---------------------------------------------------------------------------
-- Entitlement overrides (audited manual corrections)
-- ---------------------------------------------------------------------------
create table public.entitlement_overrides (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references public.profiles (id) on delete cascade,
  audience      public.plan_audience not null,
  effect        text not null,
  plan_id       uuid references public.subscription_plans (id) on delete restrict,
  valid_from    timestamptz not null default now(),
  valid_until   timestamptz,
  reason        text not null,
  created_by    uuid not null references public.profiles (id) on delete restrict,
  created_at    timestamptz not null default now(),
  revoked_at    timestamptz,
  revoked_by    uuid references public.profiles (id) on delete set null,
  revoke_reason text,
  constraint entitlement_overrides_effect check (effect in ('grant', 'revoke')),
  constraint entitlement_overrides_reason_len check (char_length(reason) between 5 and 1000),
  constraint entitlement_overrides_window check (valid_until is null or valid_until > valid_from),
  constraint entitlement_overrides_not_self check (created_by <> profile_id),
  constraint entitlement_overrides_creator_plan check (audience = 'listener' or effect = 'revoke' or plan_id is not null),
  constraint entitlement_overrides_revocation check ((revoked_at is null) = (revoked_by is null))
);

create index entitlement_overrides_profile_idx on public.entitlement_overrides (profile_id, audience) where revoked_at is null;

-- ---------------------------------------------------------------------------
-- Entitlement checks (used by RLS and by Medical Chronicles in 0130)
-- ---------------------------------------------------------------------------
create or replace function app_private.setting_int(p_key text, p_default integer)
returns integer language sql stable security definer set search_path = '' as $$
  select coalesce((select (value #>> '{}')::integer from public.platform_settings where key = p_key), p_default);
$$;

create or replace function app_private.setting_bool(p_key text, p_default boolean)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select (value #>> '{}')::boolean from public.platform_settings where key = p_key), p_default);
$$;

/**
 * Same precedence as packages/billing/src/entitlements.ts:
 * active revoke override → no; live subscription (incl. grace, not after a
 * cancellation) → yes; active grant override → yes.
 */
create or replace function app_private.has_active_entitlement(p_profile_id uuid, p_audience public.plan_audience)
returns boolean language sql stable security definer set search_path = '' as $$
  select
    p_profile_id is not null
    and not exists (
      select 1 from public.entitlement_overrides o
      where o.profile_id = p_profile_id and o.audience = p_audience and o.effect = 'revoke'
        and o.revoked_at is null and o.valid_from <= now() and (o.valid_until is null or o.valid_until > now())
    )
    and (
      exists (
        select 1 from public.subscriptions s
        where s.profile_id = p_profile_id and s.audience = p_audience
          and s.status in ('active', 'past_due')
          and s.current_period_end is not null
          and (
            now() < s.current_period_end
            or (not s.cancel_at_period_end and not s.is_trial
                and now() < s.current_period_end + make_interval(days => app_private.setting_int('billing.grace_days', 3)))
          )
      )
      or exists (
        select 1 from public.entitlement_overrides o
        where o.profile_id = p_profile_id and o.audience = p_audience and o.effect = 'grant'
          and o.revoked_at is null and o.valid_from <= now() and (o.valid_until is null or o.valid_until > now())
      )
    );
$$;

-- ---------------------------------------------------------------------------
-- Audited administrative RPCs
-- ---------------------------------------------------------------------------
create or replace function public.grant_entitlement_override(
  p_profile_id  uuid,
  p_audience    public.plan_audience,
  p_effect      text,
  p_reason      text,
  p_valid_until timestamptz default null,
  p_plan_id     uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not app_private.is_finance() then
    raise exception 'only finance or administrators can adjust entitlements' using errcode = '42501';
  end if;
  if p_profile_id = auth.uid() then
    raise exception 'you cannot adjust your own entitlements' using errcode = '42501';
  end if;
  insert into public.entitlement_overrides (profile_id, audience, effect, plan_id, valid_until, reason, created_by)
  values (p_profile_id, p_audience, p_effect, p_plan_id, p_valid_until, p_reason, auth.uid())
  returning id into v_id;
  insert into public.audit_logs (actor_profile_id, action, entity_type, entity_id, after)
  values (auth.uid(), 'entitlement.' || p_effect, 'entitlement_overrides', v_id,
          jsonb_build_object('profile_id', p_profile_id, 'audience', p_audience, 'valid_until', p_valid_until, 'reason', p_reason));
  return v_id;
end;
$$;

create or replace function public.revoke_entitlement_override(p_override_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_before jsonb;
begin
  if not app_private.is_finance() then
    raise exception 'only finance or administrators can adjust entitlements' using errcode = '42501';
  end if;
  if coalesce(char_length(trim(p_reason)), 0) < 5 then
    raise exception 'a reason is required';
  end if;
  select to_jsonb(o) into v_before from public.entitlement_overrides o where o.id = p_override_id and o.revoked_at is null;
  if v_before is null then
    raise exception 'override not found or already revoked';
  end if;
  update public.entitlement_overrides
     set revoked_at = now(), revoked_by = auth.uid(), revoke_reason = p_reason
   where id = p_override_id;
  insert into public.audit_logs (actor_profile_id, action, entity_type, entity_id, before, after)
  values (auth.uid(), 'entitlement.override_revoked', 'entitlement_overrides', p_override_id, v_before, jsonb_build_object('reason', p_reason));
end;
$$;

/** A listener cancels their own subscription at period end. The only subscription write a listener can make. */
create or replace function public.cancel_my_subscription(p_subscription_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.subscriptions
     set cancel_at_period_end = true, cancelled_at = now(), updated_at = now()
   where id = p_subscription_id and profile_id = auth.uid()
     and status in ('active', 'past_due') and not cancel_at_period_end;
  if not found then
    raise exception 'no cancellable subscription found';
  end if;
  insert into public.audit_logs (actor_profile_id, action, entity_type, entity_id)
  values (auth.uid(), 'subscription.cancel_requested', 'subscriptions', p_subscription_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges and RLS
-- ---------------------------------------------------------------------------
grant execute on function app_private.has_platform_role(public.platform_role[]) to anon, authenticated, service_role;
grant execute on function app_private.is_finance() to anon, authenticated, service_role;
grant execute on function app_private.can_read_billing() to anon, authenticated, service_role;
grant execute on function app_private.setting_int(text, integer) to anon, authenticated, service_role;
grant execute on function app_private.setting_bool(text, boolean) to anon, authenticated, service_role;
grant execute on function app_private.has_active_entitlement(uuid, public.plan_audience) to anon, authenticated, service_role;
revoke execute on function public.grant_entitlement_override(uuid, public.plan_audience, text, text, timestamptz, uuid) from public, anon;
revoke execute on function public.revoke_entitlement_override(uuid, text) from public, anon;
revoke execute on function public.cancel_my_subscription(uuid) from public, anon;
grant execute on function public.grant_entitlement_override(uuid, public.plan_audience, text, text, timestamptz, uuid) to authenticated, service_role;
grant execute on function public.revoke_entitlement_override(uuid, text) to authenticated, service_role;
grant execute on function public.cancel_my_subscription(uuid) to authenticated, service_role;

grant select on public.platform_settings, public.subscription_plans to anon, authenticated;
grant update (value) on public.platform_settings to authenticated;
grant insert, update on public.subscription_plans to authenticated;
grant select on public.subscriptions, public.payment_transactions, public.subscription_payments,
                public.entitlement_overrides, public.refund_requests to authenticated;
grant select, insert, update on public.promo_codes to authenticated;
grant insert on public.refund_requests to authenticated;
grant select on public.payment_webhook_events to authenticated;
grant all on public.platform_settings, public.subscription_plans, public.promo_codes, public.subscriptions,
             public.payment_transactions, public.subscription_payments, public.payment_webhook_events,
             public.refund_requests, public.entitlement_overrides to service_role;

alter table public.platform_settings        enable row level security;
alter table public.subscription_plans       enable row level security;
alter table public.promo_codes              enable row level security;
alter table public.subscriptions            enable row level security;
alter table public.payment_transactions     enable row level security;
alter table public.subscription_payments    enable row level security;
alter table public.payment_webhook_events   enable row level security;
alter table public.refund_requests          enable row level security;
alter table public.entitlement_overrides    enable row level security;

-- Settings: non-sensitive keys are public; edits by admins only.
create policy platform_settings_read on public.platform_settings for select
  using (not is_sensitive or app_private.is_platform_admin());
create policy platform_settings_admin_update on public.platform_settings for update to authenticated
  using (app_private.is_platform_admin()) with check (app_private.is_platform_admin());

-- Plans: anyone sees active plans; finance/admin see and manage all.
create policy subscription_plans_public_read on public.subscription_plans for select
  using (is_active or app_private.is_finance());
create policy subscription_plans_finance_insert on public.subscription_plans for insert to authenticated
  with check (app_private.is_finance());
create policy subscription_plans_finance_update on public.subscription_plans for update to authenticated
  using (app_private.is_finance()) with check (app_private.is_finance());

-- Promo codes are never listed publicly; the server checks a code by value.
create policy promo_codes_finance_all on public.promo_codes for all to authenticated
  using (app_private.is_finance()) with check (app_private.is_finance());

-- Subscriptions, payments, overrides: owner reads own; billing staff read all; nobody writes from a client.
create policy subscriptions_owner_read on public.subscriptions for select to authenticated
  using (profile_id = auth.uid() or app_private.can_read_billing());
create policy payment_transactions_owner_read on public.payment_transactions for select to authenticated
  using (profile_id = auth.uid() or app_private.can_read_billing());
create policy subscription_payments_owner_read on public.subscription_payments for select to authenticated
  using (exists (select 1 from public.subscriptions s where s.id = subscription_id and (s.profile_id = auth.uid() or app_private.can_read_billing())));
create policy entitlement_overrides_owner_read on public.entitlement_overrides for select to authenticated
  using (profile_id = auth.uid() or app_private.can_read_billing());
create policy payment_webhook_events_finance_read on public.payment_webhook_events for select to authenticated
  using (app_private.is_finance());

create policy refund_requests_owner_read on public.refund_requests for select to authenticated
  using (requested_by = auth.uid() or app_private.can_read_billing());
create policy refund_requests_owner_create on public.refund_requests for insert to authenticated
  with check (
    requested_by = auth.uid() and status = 'requested' and decided_by is null
    and exists (select 1 from public.payment_transactions t where t.id = transaction_id and t.profile_id = auth.uid() and t.status = 'successful')
  );

-- Audit trail for every commercial table.
do $$
declare t text;
begin
  foreach t in array array['platform_settings', 'subscription_plans', 'promo_codes', 'subscriptions',
                           'payment_transactions', 'entitlement_overrides', 'refund_requests']
  loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function app_private.audit_row_change()', t || '_audit', t);
  end loop;
end $$;

-- platform_settings has a text key, not a uuid id; audit_row_change reads ->>'id' which is null here,
-- so the key is still captured in before/after.

create trigger subscription_plans_updated_at before update on public.subscription_plans
  for each row execute function app_private.set_updated_at();
create trigger subscriptions_updated_at before update on public.subscriptions
  for each row execute function app_private.set_updated_at();

-- Reversal (manual):
--   drop function public.cancel_my_subscription(uuid), public.revoke_entitlement_override(uuid, text),
--     public.grant_entitlement_override(uuid, public.plan_audience, text, text, timestamptz, uuid),
--     app_private.has_active_entitlement(uuid, public.plan_audience), app_private.setting_bool(text, boolean),
--     app_private.setting_int(text, integer);
--   drop table public.entitlement_overrides, public.refund_requests, public.payment_webhook_events,
--     public.subscription_payments, public.payment_transactions, public.subscriptions, public.promo_codes,
--     public.subscription_plans, public.platform_settings;
--   drop type public.payment_status, public.subscription_status, public.billing_interval, public.plan_audience;
--   drop function app_private.can_read_billing(), app_private.is_finance(), app_private.has_platform_role(public.platform_role[]);
