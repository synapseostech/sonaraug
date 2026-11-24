-- =============================================================================
-- 0040 — Podcasts, channels, RSS ingestion
-- =============================================================================
-- A podcast belongs to either an organisation (broadcaster) or a creator
-- channel. RSS ingestion is idempotent by (podcast_id, guid): re-importing a
-- feed is safe and never duplicates an episode.
-- =============================================================================

create table public.creators (
  id                   uuid primary key default gen_random_uuid(),
  profile_id           uuid not null unique references public.profiles (id) on delete cascade,
  org_id               uuid references public.organisations (id) on delete set null,
  display_name         text not null,
  bio                  text,
  verification_status  public.verification_status not null default 'unverified',
  monetisation_status  public.monetisation_status not null default 'ineligible',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint creators_display_name_len check (char_length(display_name) between 1 and 80)
);

create index creators_org_idx on public.creators (org_id) where org_id is not null;

create table public.creator_channels (
  id              uuid primary key default gen_random_uuid(),
  creator_id      uuid not null references public.creators (id) on delete cascade,
  slug            citext not null unique,
  name            text not null,
  description     text,
  avatar_asset_id uuid references public.media_assets (id) on delete set null,
  banner_asset_id uuid references public.media_assets (id) on delete set null,
  status          public.content_status not null default 'draft',
  is_verified     boolean not null default false,
  published_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  search_vector   tsvector,
  constraint creator_channels_slug_format check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,38})[a-z0-9]$'),
  constraint creator_channels_published_requires_timestamp
    check (status <> 'published' or published_at is not null)
);

create index creator_channels_creator_idx on public.creator_channels (creator_id);
create index creator_channels_public_idx on public.creator_channels (published_at desc)
  where status = 'published';
create index creator_channels_search_idx on public.creator_channels using gin (search_vector);

create table public.podcasts (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid references public.organisations (id) on delete restrict,
  channel_id          uuid references public.creator_channels (id) on delete cascade,
  slug                citext not null unique,
  title               text not null,
  description         text,
  artwork_asset_id    uuid references public.media_assets (id) on delete set null,
  category_id         text references public.content_categories (id) on delete restrict,
  language_code       text references public.languages (code) on delete restrict,
  author_display      text,
  explicit            boolean not null default false,
  status              public.content_status not null default 'draft',
  download_allowed    boolean not null default true,
  monetisation_status public.monetisation_status not null default 'ineligible',
  published_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  search_vector       tsvector,
  -- Exactly one owner: either a broadcaster organisation or a creator channel.
  constraint podcasts_owner_exactly_one check (num_nonnulls(org_id, channel_id) = 1),
  constraint podcasts_slug_format check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,38})[a-z0-9]$'),
  constraint podcasts_title_len check (char_length(title) between 2 and 200),
  constraint podcasts_published_requires_timestamp
    check (status <> 'published' or published_at is not null)
);

create index podcasts_org_idx on public.podcasts (org_id) where org_id is not null;
create index podcasts_channel_idx on public.podcasts (channel_id) where channel_id is not null;
create index podcasts_directory_idx on public.podcasts (status, category_id)
  where status = 'published';
create index podcasts_search_idx on public.podcasts using gin (search_vector);

create table public.rss_feeds (
  id                   uuid primary key default gen_random_uuid(),
  podcast_id           uuid not null unique references public.podcasts (id) on delete cascade,
  feed_url             text not null unique,
  etag                 text,
  last_modified        text,
  last_fetched_at      timestamptz,
  last_success_at      timestamptz,
  last_error           text,
  consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  is_active            boolean not null default true,
  next_fetch_at        timestamptz not null default now(),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint rss_feeds_url_scheme check (feed_url ~* '^https?://[^\s]+$')
);

create index rss_feeds_due_idx on public.rss_feeds (next_fetch_at)
  where is_active and consecutive_failures < 24;

comment on column public.rss_feeds.next_fetch_at is
  'Polling cursor advanced with exponential backoff by the rss-import worker.';

create table public.podcast_episodes (
  id                  uuid primary key default gen_random_uuid(),
  podcast_id          uuid not null references public.podcasts (id) on delete cascade,
  -- The feed's <guid>. With podcast_id this is the idempotency key for imports.
  guid                text not null,
  title               text not null,
  summary             text,
  description         text,
  audio_asset_id      uuid references public.media_assets (id) on delete restrict,
  external_audio_url  text,
  duration_seconds    integer check (duration_seconds is null or duration_seconds >= 0),
  episode_number      integer,
  season_number       integer,
  published_at        timestamptz,
  status              public.content_status not null default 'draft',
  source              public.episode_source not null default 'upload',
  explicit            boolean not null default false,
  transcript_asset_id uuid references public.media_assets (id) on delete set null,
  download_allowed    boolean,
  play_count_cached   bigint not null default 0 check (play_count_cached >= 0),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  search_vector       tsvector,
  constraint podcast_episodes_guid_unique unique (podcast_id, guid),
  constraint podcast_episodes_title_len check (char_length(title) between 1 and 300),
  constraint podcast_episodes_audio_exactly_one
    check (num_nonnulls(audio_asset_id, external_audio_url) = 1),
  constraint podcast_episodes_published_requires_timestamp
    check (status <> 'published' or published_at is not null)
);

create index podcast_episodes_feed_idx on public.podcast_episodes (podcast_id, published_at desc);
create index podcast_episodes_published_idx on public.podcast_episodes (published_at desc)
  where status = 'published';
create index podcast_episodes_search_idx on public.podcast_episodes using gin (search_vector);

comment on constraint podcast_episodes_guid_unique on public.podcast_episodes is
  'Makes RSS ingestion idempotent. The import worker upserts with ON CONFLICT DO NOTHING.';
