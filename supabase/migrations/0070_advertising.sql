-- =============================================================================
-- 0070 — Advertising: advertisers, campaigns, creatives, placements, delivery
-- =============================================================================
-- Money is stored as integer minor units (UGX has no minor unit, so these are
-- whole shillings). No floats touch a budget, ever.
--
-- Impressions and clicks are written by server-side code only. No client can
-- insert an impression, which is what makes the numbers auditable.
-- =============================================================================

create table public.advertisers (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null unique references public.organisations (id) on delete restrict,
  billing_email citext not null,
  billing_phone text,
  status        public.account_status not null default 'active',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Inventory definitions: the surfaces on which a sponsor can appear.
create table public.placements (
  key            text primary key,
  label          text not null,
  surface        text not null check (surface in
                   ('home', 'radio', 'podcasts', 'watch', 'player', 'search')),
  format         public.ad_kind not null,
  is_active      boolean not null default false,
  max_per_view   integer not null default 1 check (max_per_view between 1 and 10),
  description    text,
  created_at     timestamptz not null default now()
);

insert into public.placements (key, label, surface, format, is_active, description) values
  ('home_hero',          'Home hero',              'home',     'image', false, 'Single sponsored hero card at the top of Home.'),
  ('home_rail',          'Home rail card',         'home',     'image', false, 'Sponsored card inside a home carousel.'),
  ('radio_directory',    'Radio directory banner', 'radio',    'image', false, 'Banner within the station directory list.'),
  ('podcast_directory',  'Podcast directory card', 'podcasts', 'image', false, 'Sponsored podcast card in the directory.'),
  ('watch_feed',         'Watch feed item',        'watch',    'video', false, 'Sponsored video in the watch feed.'),
  ('player_companion',   'Player companion',       'player',   'image', false, 'Static creative beside the full player.');

create table public.campaigns (
  id                uuid primary key default gen_random_uuid(),
  advertiser_id     uuid not null references public.advertisers (id) on delete cascade,
  name              text not null,
  objective         text not null check (objective in ('awareness', 'consideration', 'conversion')),
  status            public.campaign_status not null default 'draft',
  starts_at         timestamptz not null,
  ends_at           timestamptz not null,
  total_budget_ugx  bigint not null check (total_budget_ugx >= 0),
  daily_budget_ugx  bigint check (daily_budget_ugx is null or daily_budget_ugx >= 0),
  spent_ugx         bigint not null default 0 check (spent_ugx >= 0),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint campaigns_time_order check (ends_at > starts_at),
  constraint campaigns_daily_within_total
    check (daily_budget_ugx is null or daily_budget_ugx <= total_budget_ugx),
  constraint campaigns_spend_within_budget check (spent_ugx <= total_budget_ugx)
);

create index campaigns_advertiser_idx on public.campaigns (advertiser_id, created_at desc);
create index campaigns_live_idx on public.campaigns (starts_at, ends_at)
  where status = 'active';

create table public.advertisements (
  id               uuid primary key default gen_random_uuid(),
  campaign_id      uuid not null references public.campaigns (id) on delete cascade,
  name             text not null,
  kind             public.ad_kind not null,
  creative_asset_id uuid references public.media_assets (id) on delete restrict,
  click_url        text,
  duration_seconds integer check (duration_seconds is null or duration_seconds between 1 and 120),
  status           public.content_status not null default 'draft',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint advertisements_click_url_scheme check (click_url is null or click_url ~* '^https://[^\s]+$')
);

create index advertisements_campaign_idx on public.advertisements (campaign_id);

create table public.campaign_placements (
  campaign_id  uuid not null references public.campaigns (id) on delete cascade,
  placement    text not null references public.placements (key) on delete restrict,
  weight       integer not null default 10 check (weight between 1 and 100),
  starts_at    timestamptz,
  ends_at      timestamptz,
  primary key (campaign_id, placement),
  constraint campaign_placements_window check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create table public.frequency_caps (
  id              uuid primary key default gen_random_uuid(),
  campaign_id     uuid not null references public.campaigns (id) on delete cascade,
  scope           text not null check (scope in ('profile', 'session')),
  max_impressions integer not null check (max_impressions between 1 and 100),
  window_hours    integer not null default 24 check (window_hours between 1 and 720),
  constraint frequency_caps_unique unique (campaign_id, scope)
);

-- Delivery records. `dedupe_key` is supplied by the server so a retried beacon
-- cannot inflate the numbers.
create table public.impressions (
  id              uuid primary key default gen_random_uuid(),
  campaign_id     uuid not null references public.campaigns (id) on delete cascade,
  advertisement_id uuid not null references public.advertisements (id) on delete cascade,
  placement       text not null references public.placements (key) on delete restrict,
  profile_id      uuid references public.profiles (id) on delete set null,
  session_id      uuid,
  dedupe_key      text not null unique,
  occurred_at     timestamptz not null default now(),
  platform        text,
  consent_state   text not null default 'granted' check (consent_state in ('granted', 'denied', 'unknown')),
  billable        boolean not null default true
);

create index impressions_campaign_idx on public.impressions (campaign_id, occurred_at desc);
create index impressions_placement_idx on public.impressions (placement, occurred_at desc);

create table public.clicks (
  id             uuid primary key default gen_random_uuid(),
  impression_id  uuid not null unique references public.impressions (id) on delete cascade,
  occurred_at    timestamptz not null default now()
);

create table public.payouts (
  id              uuid primary key default gen_random_uuid(),
  payee_kind      text not null check (payee_kind in ('creator', 'organisation')),
  creator_id      uuid references public.creators (id) on delete restrict,
  org_id          uuid references public.organisations (id) on delete restrict,
  period_start    date not null,
  period_end      date not null,
  gross_ugx       bigint not null check (gross_ugx >= 0),
  platform_fee_ugx bigint not null default 0 check (platform_fee_ugx >= 0),
  net_ugx         bigint not null check (net_ugx >= 0),
  status          public.payout_status not null default 'accrued',
  method          text,
  reference       text,
  approved_by     uuid references public.profiles (id) on delete set null,
  approved_at     timestamptz,
  paid_at         timestamptz,
  created_at      timestamptz not null default now(),
  constraint payouts_period_order check (period_end >= period_start),
  constraint payouts_payee_exactly_one check (num_nonnulls(creator_id, org_id) = 1),
  constraint payouts_net_math check (net_ugx = gross_ugx - platform_fee_ugx),
  constraint payouts_payee_kind_matches
    check ((payee_kind = 'creator' and creator_id is not null)
        or (payee_kind = 'organisation' and org_id is not null))
);

create index payouts_status_idx on public.payouts (status, period_end desc);
