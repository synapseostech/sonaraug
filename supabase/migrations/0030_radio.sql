-- =============================================================================
-- 0030 — Radio: stations, streams, programmes, schedules, presenters, health
-- =============================================================================
-- The distinction between a registered, verified, reachable and playable
-- stream is the core of radio reliability. A broadcaster may register any
-- endpoint; only one that our prober has actually played may be served.
-- =============================================================================

create table public.stations (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references public.organisations (id) on delete restrict,
  slug                  citext not null unique,
  name                  text not null,
  tagline               text,
  description           text,
  artwork_asset_id      uuid references public.media_assets (id) on delete set null,
  category_id           text references public.content_categories (id) on delete restrict,
  region_code           text references public.regions (code) on delete restrict,
  language_codes        text[] not null default '{}',
  frequency_text        text,
  website_url           text,
  status                public.content_status not null default 'draft',
  is_featured           boolean not null default false,
  featured_from         timestamptz,
  featured_until        timestamptz,
  published_at          timestamptz,
  created_by            uuid references public.profiles (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  search_vector         tsvector,
  constraint stations_name_len check (char_length(name) between 2 and 120),
  constraint stations_slug_format check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,38})[a-z0-9]$'),
  constraint stations_published_requires_timestamp
    check (status <> 'published' or published_at is not null),
  constraint stations_featured_window
    check (featured_until is null or featured_from is null or featured_until > featured_from),
  constraint stations_languages_present check (array_length(language_codes, 1) is null or array_length(language_codes, 1) <= 6)
);

create index stations_org_idx on public.stations (org_id);
create index stations_directory_idx on public.stations (status, region_code, category_id)
  where status = 'published';
create index stations_featured_idx on public.stations (is_featured, published_at desc)
  where status = 'published' and is_featured;
create index stations_languages_idx on public.stations using gin (language_codes);
create index stations_search_idx on public.stations using gin (search_vector);

create table public.station_streams (
  id                  uuid primary key default gen_random_uuid(),
  station_id          uuid not null references public.stations (id) on delete cascade,
  label               text not null default 'Main',
  protocol            public.stream_protocol not null,
  url                 text not null,
  -- A backup always belongs to the same station; enforced by trigger.
  backup_of_stream_id uuid references public.station_streams (id) on delete set null,
  codec               text,
  bitrate_kbps        integer check (bitrate_kbps is null or bitrate_kbps between 8 and 512),
  sample_rate_hz      integer check (sample_rate_hz is null or sample_rate_hz between 8000 and 192000),
  is_primary          boolean not null default false,
  status              public.stream_status not null default 'registered',
  last_verified_at    timestamptz,
  last_checked_at     timestamptz,
  consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint station_streams_url_scheme check (url ~* '^https?://[^\s]+$'),
  constraint station_streams_backup_not_self check (backup_of_stream_id is null or backup_of_stream_id <> id),
  constraint station_streams_playable_has_verification
    check (status not in ('reachable', 'playable') or last_verified_at is not null)
);

-- At most one primary endpoint per station, and every station that is published
-- must have at least one playable endpoint (checked by the publish trigger).
create unique index station_streams_one_primary
  on public.station_streams (station_id) where is_primary;
create index station_streams_station_idx on public.station_streams (station_id, status);
create index station_streams_probe_queue_idx on public.station_streams (status, last_checked_at)
  where status <> 'revoked';

comment on table public.station_streams is
  'Broadcaster-supplied endpoints. Never retransmitted or re-encoded: the listener connects to the origin directly.';

create table public.programmes (
  id               uuid primary key default gen_random_uuid(),
  station_id       uuid not null references public.stations (id) on delete cascade,
  title            text not null,
  description      text,
  artwork_asset_id uuid references public.media_assets (id) on delete set null,
  status           public.content_status not null default 'draft',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint programmes_title_len check (char_length(title) between 1 and 160)
);

create index programmes_station_idx on public.programmes (station_id);

create table public.presenters (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organisations (id) on delete cascade,
  profile_id      uuid references public.profiles (id) on delete set null,
  display_name    text not null,
  bio             text,
  photo_asset_id  uuid references public.media_assets (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint presenters_display_name_len check (char_length(display_name) between 1 and 80)
);

create index presenters_org_idx on public.presenters (org_id);

create table public.programme_presenters (
  programme_id uuid not null references public.programmes (id) on delete cascade,
  presenter_id uuid not null references public.presenters (id) on delete cascade,
  primary key (programme_id, presenter_id)
);

create table public.schedules (
  id             uuid primary key default gen_random_uuid(),
  station_id     uuid not null references public.stations (id) on delete cascade,
  programme_id   uuid references public.programmes (id) on delete cascade,
  -- 0 = Monday .. 6 = Sunday (ISO weekday ordering, stored explicitly).
  day_of_week    smallint not null check (day_of_week between 0 and 6),
  start_time     time not null,
  end_time       time not null,
  timezone       text not null default 'Africa/Kampala',
  effective_from date not null default current_date,
  effective_to   date,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint schedules_time_order check (end_time > start_time),
  constraint schedules_effective_order check (effective_to is null or effective_to >= effective_from),
  -- Two programmes cannot occupy the same slot on the same station. Enforced in
  -- the database because a double-booked schedule is a public embarrassment.
  constraint schedules_no_overlap exclude using gist (
    station_id with =,
    day_of_week with =,
    public.timerange(start_time, end_time) with &&,
    daterange(effective_from, effective_to, '[]') with &&
  )
);

create index schedules_station_day_idx on public.schedules (station_id, day_of_week, start_time);

create table public.stream_health_checks (
  id                  bigint generated always as identity,
  stream_id           uuid not null references public.station_streams (id) on delete cascade,
  checked_at          timestamptz not null default now(),
  dns_ok              boolean,
  connect_ms          integer check (connect_ms is null or connect_ms >= 0),
  first_byte_ms       integer check (first_byte_ms is null or first_byte_ms >= 0),
  http_status         integer,
  content_type        text,
  bitrate_observed_kbps integer,
  ok                  boolean not null,
  error_code          text,
  primary key (id, checked_at)
) partition by range (checked_at);

comment on table public.stream_health_checks is
  'Append-only probe results, partitioned monthly. Never read by clients; feeds the station health dashboard and alerting.';

create table public.stream_health_checks_default partition of public.stream_health_checks default;
create index stream_health_checks_stream_idx on public.stream_health_checks (stream_id, checked_at desc);
create index stream_health_checks_failures_idx on public.stream_health_checks (checked_at desc)
  where ok = false;

create table public.stream_incidents (
  id             uuid primary key default gen_random_uuid(),
  stream_id      uuid not null references public.station_streams (id) on delete cascade,
  started_at     timestamptz not null,
  ended_at       timestamptz,
  failure_count  integer not null default 1 check (failure_count > 0),
  last_error     text,
  constraint stream_incidents_time_order check (ended_at is null or ended_at >= started_at)
);

create index stream_incidents_open_idx on public.stream_incidents (stream_id)
  where ended_at is null;
