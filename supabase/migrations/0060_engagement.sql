-- =============================================================================
-- 0060 — Listener engagement: favourites, follows, playlists, history, comments
-- =============================================================================
-- Polymorphic targets (a favourite may point at a station, podcast, episode or
-- video) are modelled as typed nullable foreign keys with a CHECK that exactly
-- one is set. This keeps real referential integrity instead of an unchecked
-- `target_id uuid`.
-- =============================================================================

create table public.favourites (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  station_id  uuid references public.stations (id) on delete cascade,
  podcast_id  uuid references public.podcasts (id) on delete cascade,
  episode_id  uuid references public.podcast_episodes (id) on delete cascade,
  video_id    uuid references public.videos (id) on delete cascade,
  channel_id  uuid references public.creator_channels (id) on delete cascade,
  created_at  timestamptz not null default now(),
  constraint favourites_one_target
    check (num_nonnulls(station_id, podcast_id, episode_id, video_id, channel_id) = 1)
);

create unique index favourites_unique_station on public.favourites (profile_id, station_id) where station_id is not null;
create unique index favourites_unique_podcast on public.favourites (profile_id, podcast_id) where podcast_id is not null;
create unique index favourites_unique_episode on public.favourites (profile_id, episode_id) where episode_id is not null;
create unique index favourites_unique_video on public.favourites (profile_id, video_id) where video_id is not null;
create unique index favourites_unique_channel on public.favourites (profile_id, channel_id) where channel_id is not null;
create index favourites_profile_idx on public.favourites (profile_id, created_at desc);

create table public.follows (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  station_id  uuid references public.stations (id) on delete cascade,
  podcast_id  uuid references public.podcasts (id) on delete cascade,
  channel_id  uuid references public.creator_channels (id) on delete cascade,
  notify      boolean not null default true,
  created_at  timestamptz not null default now(),
  constraint follows_one_target check (num_nonnulls(station_id, podcast_id, channel_id) = 1)
);

create unique index follows_unique_station on public.follows (profile_id, station_id) where station_id is not null;
create unique index follows_unique_podcast on public.follows (profile_id, podcast_id) where podcast_id is not null;
create unique index follows_unique_channel on public.follows (profile_id, channel_id) where channel_id is not null;
create index follows_profile_idx on public.follows (profile_id);

create table public.playlists (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid not null references public.profiles (id) on delete cascade,
  title           text not null,
  description     text,
  visibility      public.visibility not null default 'private',
  cover_asset_id  uuid references public.media_assets (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint playlists_title_len check (char_length(title) between 1 and 120)
);

create index playlists_profile_idx on public.playlists (profile_id, created_at desc);

create table public.playlist_items (
  id          uuid primary key default gen_random_uuid(),
  playlist_id uuid not null references public.playlists (id) on delete cascade,
  episode_id  uuid references public.podcast_episodes (id) on delete cascade,
  video_id    uuid references public.videos (id) on delete cascade,
  position    integer not null check (position >= 0),
  added_at    timestamptz not null default now(),
  constraint playlist_items_one_target check (num_nonnulls(episode_id, video_id) = 1),
  -- Deferrable so a reorder can update several rows inside one transaction.
  constraint playlist_items_position_unique unique (playlist_id, position) deferrable initially deferred
);

create index playlist_items_playlist_idx on public.playlist_items (playlist_id, position);

-- Resume state: one row per listener per item. This is what "continue listening"
-- reads. Kept separate from playback_events so the hot path is a single upsert.
create table public.playback_progress (
  id                uuid primary key default gen_random_uuid(),
  profile_id        uuid not null references public.profiles (id) on delete cascade,
  station_id        uuid references public.stations (id) on delete cascade,
  episode_id        uuid references public.podcast_episodes (id) on delete cascade,
  video_id          uuid references public.videos (id) on delete cascade,
  position_seconds  numeric(10, 2) not null default 0 check (position_seconds >= 0),
  duration_seconds  numeric(10, 2) check (duration_seconds is null or duration_seconds > 0),
  completed         boolean not null default false,
  last_played_at    timestamptz not null default now(),
  constraint playback_progress_one_target
    check (num_nonnulls(station_id, episode_id, video_id) = 1)
);

create unique index playback_progress_unique_station on public.playback_progress (profile_id, station_id) where station_id is not null;
create unique index playback_progress_unique_episode on public.playback_progress (profile_id, episode_id) where episode_id is not null;
create unique index playback_progress_unique_video on public.playback_progress (profile_id, video_id) where video_id is not null;
create index playback_progress_recent_idx on public.playback_progress (profile_id, last_played_at desc);

-- Append-only analytics stream, partitioned monthly. Anonymous listeners have a
-- NULL profile_id: playback reliability matters regardless of who is listening.
create table public.playback_events (
  id               bigint generated always as identity,
  profile_id       uuid references public.profiles (id) on delete set null,
  station_id       uuid references public.stations (id) on delete set null,
  episode_id       uuid references public.podcast_episodes (id) on delete set null,
  video_id         uuid references public.videos (id) on delete set null,
  event_type       text not null check (event_type in
                     ('play', 'pause', 'resume', 'complete', 'error', 'seek', 'speed_change', 'rebuffer')),
  position_seconds numeric(10, 2),
  error_code       text,
  platform         text check (platform is null or platform in ('android', 'ios', 'web')),
  network_type     text,
  session_id       uuid,
  occurred_at      timestamptz not null default now(),
  primary key (id, occurred_at),
  constraint playback_events_one_target
    check (num_nonnulls(station_id, episode_id, video_id) = 1)
) partition by range (occurred_at);

create table public.playback_events_default partition of public.playback_events default;
create index playback_events_target_idx on public.playback_events (occurred_at desc);

create table public.comments (
  id                uuid primary key default gen_random_uuid(),
  profile_id        uuid not null references public.profiles (id) on delete cascade,
  station_id        uuid references public.stations (id) on delete cascade,
  episode_id        uuid references public.podcast_episodes (id) on delete cascade,
  video_id          uuid references public.videos (id) on delete cascade,
  parent_id         uuid references public.comments (id) on delete cascade,
  body              text not null,
  status            text not null default 'visible' check (status in ('visible', 'pending', 'hidden', 'deleted')),
  moderation_reason text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint comments_one_target check (num_nonnulls(station_id, episode_id, video_id) = 1),
  constraint comments_body_len check (char_length(body) between 1 and 2000)
);

create index comments_video_idx on public.comments (video_id, created_at desc) where video_id is not null;
create index comments_episode_idx on public.comments (episode_id, created_at desc) where episode_id is not null;
create index comments_station_idx on public.comments (station_id, created_at desc) where station_id is not null;
create index comments_profile_idx on public.comments (profile_id, created_at desc);

create table public.reactions (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  episode_id uuid references public.podcast_episodes (id) on delete cascade,
  video_id   uuid references public.videos (id) on delete cascade,
  kind       public.reaction_kind not null default 'like',
  created_at timestamptz not null default now(),
  constraint reactions_one_target check (num_nonnulls(episode_id, video_id) = 1)
);

create unique index reactions_unique_episode on public.reactions (profile_id, episode_id, kind) where episode_id is not null;
create unique index reactions_unique_video on public.reactions (profile_id, video_id, kind) where video_id is not null;
