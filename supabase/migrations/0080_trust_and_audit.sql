-- =============================================================================
-- 0080 — Trust, safety, rights and audit
-- =============================================================================
-- rights_records is not paperwork: the publish trigger refuses to make a
-- station public without a rights record in force for Uganda. That is the
-- technical half of the copyright obligation; the legal agreements are
-- tracked in docs/security/copyright-and-rights.md.
-- =============================================================================

create table public.content_reports (
  id                  uuid primary key default gen_random_uuid(),
  reporter_profile_id uuid references public.profiles (id) on delete set null,
  reporter_contact    citext,
  station_id          uuid references public.stations (id) on delete cascade,
  podcast_id          uuid references public.podcasts (id) on delete cascade,
  episode_id          uuid references public.podcast_episodes (id) on delete cascade,
  video_id            uuid references public.videos (id) on delete cascade,
  channel_id          uuid references public.creator_channels (id) on delete cascade,
  comment_id          uuid references public.comments (id) on delete cascade,
  reason              public.report_reason not null,
  details             text,
  status              public.report_status not null default 'open',
  assigned_to         uuid references public.profiles (id) on delete set null,
  resolution_note     text,
  created_at          timestamptz not null default now(),
  resolved_at         timestamptz,
  constraint content_reports_one_target
    check (num_nonnulls(station_id, podcast_id, episode_id, video_id, channel_id, comment_id) = 1),
  constraint content_reports_resolution_consistency
    check ((status in ('actioned', 'dismissed', 'duplicate')) = (resolved_at is not null))
);

create index content_reports_queue_idx on public.content_reports (status, created_at)
  where status in ('open', 'triaged');
create index content_reports_reporter_idx on public.content_reports (reporter_profile_id);

create table public.moderation_actions (
  id                  bigint generated always as identity primary key,
  moderator_profile_id uuid references public.profiles (id) on delete set null,
  report_id           uuid references public.content_reports (id) on delete set null,
  station_id          uuid references public.stations (id) on delete cascade,
  podcast_id          uuid references public.podcasts (id) on delete cascade,
  episode_id          uuid references public.podcast_episodes (id) on delete cascade,
  video_id            uuid references public.videos (id) on delete cascade,
  channel_id          uuid references public.creator_channels (id) on delete cascade,
  comment_id          uuid references public.comments (id) on delete cascade,
  action              public.moderation_action not null,
  reason_code         text,
  notes               text,
  created_at          timestamptz not null default now(),
  constraint moderation_actions_one_target
    check (num_nonnulls(station_id, podcast_id, episode_id, video_id, channel_id, comment_id) = 1)
);

create index moderation_actions_recent_idx on public.moderation_actions (created_at desc);

comment on table public.moderation_actions is
  'Append-only. UPDATE and DELETE are revoked, so the moderation history cannot be rewritten.';

create table public.rights_records (
  id                  uuid primary key default gen_random_uuid(),
  station_id          uuid references public.stations (id) on delete cascade,
  podcast_id          uuid references public.podcasts (id) on delete cascade,
  episode_id          uuid references public.podcast_episodes (id) on delete cascade,
  video_id            uuid references public.videos (id) on delete cascade,
  rights_holder_name  text not null,
  licence_type        public.licence_type not null,
  territory_codes     text[] not null default '{UG}',
  valid_from          date not null default current_date,
  valid_to            date,
  exclusivity         boolean not null default false,
  document_asset_id   uuid references public.media_assets (id) on delete restrict,
  notes               text,
  verified_by         uuid references public.profiles (id) on delete set null,
  verified_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint rights_records_one_target
    check (num_nonnulls(station_id, podcast_id, episode_id, video_id) = 1),
  constraint rights_records_validity_order check (valid_to is null or valid_to >= valid_from),
  constraint rights_records_territory_present check (array_length(territory_codes, 1) >= 1)
);

create index rights_records_station_idx on public.rights_records (station_id) where station_id is not null;
create index rights_records_podcast_idx on public.rights_records (podcast_id) where podcast_id is not null;
create index rights_records_video_idx on public.rights_records (video_id) where video_id is not null;

create table public.audit_logs (
  id                bigint generated always as identity primary key,
  actor_profile_id  uuid references public.profiles (id) on delete set null,
  actor_role        text,
  action            text not null,
  entity_type       text not null,
  entity_id         uuid,
  before            jsonb,
  after             jsonb,
  request_id        text,
  ip_address        inet,
  user_agent        text,
  occurred_at       timestamptz not null default now()
);

create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id, occurred_at desc);
create index audit_logs_actor_idx on public.audit_logs (actor_profile_id, occurred_at desc);
create index audit_logs_recent_idx on public.audit_logs (occurred_at desc);

comment on table public.audit_logs is
  'Append-only security and business audit trail. Service-role writes only; admins may read. Retention: 24 months minimum.';

create table public.notification_preferences (
  profile_id            uuid primary key references public.profiles (id) on delete cascade,
  push_enabled          boolean not null default true,
  new_episodes          boolean not null default true,
  station_live_alerts   boolean not null default false,
  marketing             boolean not null default false,
  quiet_hours_start     time,
  quiet_hours_end       time,
  updated_at            timestamptz not null default now()
);

create table public.push_tokens (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  token       text not null unique,
  platform    text not null check (platform in ('android', 'ios', 'web')),
  device_name text,
  last_seen_at timestamptz not null default now(),
  revoked_at  timestamptz,
  created_at  timestamptz not null default now()
);

create index push_tokens_profile_idx on public.push_tokens (profile_id) where revoked_at is null;
