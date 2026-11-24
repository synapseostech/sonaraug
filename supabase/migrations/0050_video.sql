-- =============================================================================
-- 0050 — Video: channels, videos, provider renditions, captions
-- =============================================================================
-- media_assets holds the uploaded master; video_assets holds what the provider
-- (Cloudflare Stream / Mux) produced from it. Keeping them separate means a
-- re-encode never destroys the upload record.
-- =============================================================================

create table public.videos (
  id                 uuid primary key default gen_random_uuid(),
  channel_id         uuid not null references public.creator_channels (id) on delete cascade,
  slug               citext not null,
  title              text not null,
  description        text,
  thumbnail_asset_id uuid references public.media_assets (id) on delete set null,
  master_asset_id    uuid references public.media_assets (id) on delete set null,
  category_id        text references public.content_categories (id) on delete restrict,
  language_code      text references public.languages (code) on delete restrict,
  duration_seconds   integer check (duration_seconds is null or duration_seconds >= 0),
  status             public.content_status not null default 'draft',
  visibility         public.visibility not null default 'public',
  allow_comments     boolean not null default true,
  published_at       timestamptz,
  view_count_cached  bigint not null default 0 check (view_count_cached >= 0),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  search_vector      tsvector,
  constraint videos_slug_unique unique (channel_id, slug),
  constraint videos_slug_format check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,38})[a-z0-9]$'),
  constraint videos_title_len check (char_length(title) between 2 and 200),
  constraint videos_published_requires_timestamp
    check (status <> 'published' or published_at is not null)
);

create index videos_channel_idx on public.videos (channel_id, published_at desc);
create index videos_feed_idx on public.videos (published_at desc)
  where status = 'published' and visibility = 'public';
create index videos_category_idx on public.videos (category_id)
  where status = 'published' and visibility = 'public';
create index videos_search_idx on public.videos using gin (search_vector);

create table public.video_assets (
  id                 uuid primary key default gen_random_uuid(),
  video_id           uuid not null references public.videos (id) on delete cascade,
  provider           public.storage_backend not null
                       check (provider in ('cloudflare_stream', 'mux')),
  provider_asset_id  text not null,
  playback_hls_url   text,
  playback_dash_url  text,
  thumbnail_url      text,
  renditions         jsonb not null default '[]'::jsonb,
  status             public.media_status not null default 'processing',
  error_code         text,
  ready_at           timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint video_assets_provider_asset_unique unique (provider, provider_asset_id),
  constraint video_assets_ready_has_url
    check (status <> 'ready' or playback_hls_url is not null)
);

create index video_assets_video_idx on public.video_assets (video_id, status);
create index video_assets_processing_idx on public.video_assets (status)
  where status in ('processing', 'uploading');

create table public.captions (
  id            uuid primary key default gen_random_uuid(),
  video_id      uuid not null references public.videos (id) on delete cascade,
  language_code text not null,
  kind          text not null default 'subtitles' check (kind in ('subtitles', 'captions', 'forced')),
  label         text,
  asset_id      uuid references public.media_assets (id) on delete restrict,
  is_default    boolean not null default false,
  status        public.media_status not null default 'ready',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint captions_language_unique unique (video_id, language_code, kind),
  constraint captions_ready_has_asset check (status <> 'ready' or asset_id is not null)
);

create unique index captions_one_default
  on public.captions (video_id) where is_default;
