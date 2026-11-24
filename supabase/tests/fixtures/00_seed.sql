-- =============================================================================
-- Deterministic test universe.
-- =============================================================================
-- Not production data and never shipped: these are fixtures for the security
-- matrix. Every identifier is fixed so failures are readable.
-- =============================================================================

-- Users (the auth trigger provisions profiles + notification preferences) ------
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'admin@example.invalid',    '{"display_name":"Platform Admin"}'),
  ('22222222-2222-2222-2222-222222222222', 'mod@example.invalid',      '{"display_name":"Moderator"}'),
  ('33333333-3333-3333-3333-333333333333', 'owner-a@example.invalid',  '{"display_name":"Owner A"}'),
  ('44444444-4444-4444-4444-444444444444', 'editor-a@example.invalid', '{"display_name":"Editor A"}'),
  ('55555555-5555-5555-5555-555555555555', 'owner-b@example.invalid',  '{"display_name":"Owner B"}'),
  ('66666666-6666-6666-6666-666666666666', 'creator@example.invalid',  '{"display_name":"Creator"}'),
  ('77777777-7777-7777-7777-777777777777', 'listener1@example.invalid','{"display_name":"Listener One"}'),
  ('88888888-8888-8888-8888-888888888888', 'listener2@example.invalid','{"display_name":"Listener Two"}'),
  ('99999999-9999-9999-9999-999999999999', 'advertiser@example.invalid','{"display_name":"Advertiser User"}');

insert into public.platform_roles (profile_id, role) values
  ('11111111-1111-1111-1111-111111111111', 'admin'),
  ('22222222-2222-2222-2222-222222222222', 'moderator');

-- Organisations ---------------------------------------------------------------
insert into public.organisations (id, slug, legal_name, org_type, contact_email, verification_status, verified_at, created_by) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'alpha-broadcasting', 'Alpha Broadcasting Ltd', 'broadcaster', 'ops@alpha.example', 'verified', now(), '33333333-3333-3333-3333-333333333333'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'beta-broadcasting',  'Beta Broadcasting Ltd',  'broadcaster', 'ops@beta.example',  'unverified', null, '55555555-5555-5555-5555-555555555555'),
  ('cccccccc-0000-0000-0000-000000000003', 'gamma-media',        'Gamma Media Ltd',        'advertiser',  'buy@gamma.example', 'verified', now(), '99999999-9999-9999-9999-999999999999');

insert into public.organisation_members (org_id, profile_id, role, accepted_at) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'owner',  now()),
  ('aaaaaaaa-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444', 'editor', now()),
  ('bbbbbbbb-0000-0000-0000-000000000002', '55555555-5555-5555-5555-555555555555', 'owner',  now()),
  ('cccccccc-0000-0000-0000-000000000003', '99999999-9999-9999-9999-999999999999', 'owner',  now());

-- A pending invitation (must grant nothing) -----------------------------------
insert into public.organisation_members (org_id, profile_id, role, accepted_at) values
  ('bbbbbbbb-0000-0000-0000-000000000002', '77777777-7777-7777-7777-777777777777', 'editor', null);

-- Stations --------------------------------------------------------------------
-- Station 1: published in a verified org, with a playable stream and rights.
insert into public.stations (id, org_id, slug, name, category_id, region_code, language_codes, status, created_by) values
  ('10000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
   'alpha-fm', 'Alpha FM', 'music', 'central', '{lg,en}', 'draft', '33333333-3333-3333-3333-333333333333'),
  ('10000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001',
   'alpha-news', 'Alpha News Radio', 'news', 'central', '{en}', 'draft', '33333333-3333-3333-3333-333333333333'),
  ('10000000-0000-0000-0000-000000000003', 'bbbbbbbb-0000-0000-0000-000000000002',
   'beta-fm', 'Beta FM', 'talk', 'western', '{en}', 'draft', '55555555-5555-5555-5555-555555555555');

insert into public.rights_records (station_id, rights_holder_name, licence_type, territory_codes, verified_by, verified_at)
values ('10000000-0000-0000-0000-000000000001', 'Alpha Broadcasting Ltd', 'broadcaster_authorised', '{UG}', '11111111-1111-1111-1111-111111111111', now());

insert into public.station_streams (id, station_id, label, protocol, url, is_primary, status, last_verified_at, bitrate_kbps) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
   'Main', 'icecast', 'https://stream.alpha.example/live', true, 'playable', now(), 128),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002',
   'Main', 'icecast', 'https://stream.alpha.example/news', true, 'registered', null, 96);

update public.stations set status = 'published', published_at = now()
where id = '10000000-0000-0000-0000-000000000001';

-- Podcasts --------------------------------------------------------------------
insert into public.creators (id, profile_id, display_name, verification_status)
values ('30000000-0000-0000-0000-000000000001', '66666666-6666-6666-6666-666666666666', 'Creator One', 'verified');

insert into public.creator_channels (id, creator_id, slug, name, status, published_at) values
  ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
   'creator-one', 'Creator One', 'published', now());

insert into public.media_assets (id, kind, storage_backend, storage_key, mime_type, status, owner_org_id, checksum_sha256, size_bytes) values
  ('50000000-0000-0000-0000-000000000001', 'audio', 'r2', 'audio/ep1.mp3', 'audio/mpeg', 'ready',
   'aaaaaaaa-0000-0000-0000-000000000001', repeat('a', 64), 52428800),
  ('50000000-0000-0000-0000-000000000002', 'image', 'r2', 'art/st1.jpg', 'image/jpeg', 'ready',
   'aaaaaaaa-0000-0000-0000-000000000001', null, 204800);

-- Public artwork is an explicit pipeline decision since 0110 (audit F-7).
update public.media_assets set is_public = true where id = '50000000-0000-0000-0000-000000000002';

insert into public.podcasts (id, org_id, slug, title, category_id, language_code, status, published_at) values
  ('60000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
   'alpha-talks', 'Alpha Talks', 'talk', 'en', 'published', now()),
  ('60000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001',
   'alpha-draft', 'Alpha Draft Show', 'talk', 'en', 'draft', null);

insert into public.rss_feeds (podcast_id, feed_url) values
  ('60000000-0000-0000-0000-000000000001', 'https://feeds.alpha.example/talks.xml');

insert into public.podcast_episodes (id, podcast_id, guid, title, audio_asset_id, duration_seconds, status, published_at) values
  ('70000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001',
   'ep-1', 'Episode One', '50000000-0000-0000-0000-000000000001', 1800, 'published', now()),
  ('70000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000001',
   'ep-2', 'Episode Two (draft)', '50000000-0000-0000-0000-000000000001', 1800, 'draft', null);

-- Video -----------------------------------------------------------------------
insert into public.videos (id, channel_id, slug, title, category_id, language_code, status, published_at) values
  ('80000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001',
   'vlog-one', 'Vlog One', 'entertainment', 'en', 'published', now()),
  ('80000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001',
   'vlog-draft', 'Vlog Draft', 'entertainment', 'en', 'draft', null),
  ('80000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000001',
   'vlog-unlisted', 'Vlog Unlisted', 'entertainment', 'en', 'draft', null);

insert into public.video_assets (video_id, provider, provider_asset_id, playback_hls_url, status)
values ('80000000-0000-0000-0000-000000000001', 'cloudflare_stream', 'cf-asset-1',
        'https://videodelivery.net/cf-asset-1/manifest/video.m3u8', 'ready');

-- Engagement ------------------------------------------------------------------
insert into public.comments (id, profile_id, video_id, body, status) values
  ('90000000-0000-0000-0000-000000000001', '77777777-7777-7777-7777-777777777777',
   '80000000-0000-0000-0000-000000000001', 'Visible comment', 'visible'),
  ('90000000-0000-0000-0000-000000000002', '88888888-8888-8888-8888-888888888888',
   '80000000-0000-0000-0000-000000000001', 'Hidden comment', 'hidden');

insert into public.favourites (profile_id, station_id) values
  ('77777777-7777-7777-7777-777777777777', '10000000-0000-0000-0000-000000000001');

insert into public.playback_progress (profile_id, episode_id, position_seconds, duration_seconds) values
  ('77777777-7777-7777-7777-777777777777', '70000000-0000-0000-0000-000000000001', 604, 1800);

-- Advertising -----------------------------------------------------------------
insert into public.advertisers (id, org_id, billing_email) values
  ('a1000000-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000003', 'buy@gamma.example');

insert into public.campaigns (id, advertiser_id, name, objective, status, starts_at, ends_at, total_budget_ugx) values
  ('a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001',
   'Gamma Launch', 'awareness', 'active', now() - interval '1 day', now() + interval '30 days', 5000000);

insert into public.advertisements (id, campaign_id, name, kind, status) values
  ('a3000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001',
   'Gamma Hero', 'image', 'published');

insert into public.impressions (id, campaign_id, advertisement_id, placement, dedupe_key) values
  ('a4000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001',
   'a3000000-0000-0000-0000-000000000001', 'home_hero', 'dedupe-fixture-0000000001');

-- A report for the moderation queue -------------------------------------------
insert into public.content_reports (id, reporter_profile_id, video_id, reason, details) values
  ('b1000000-0000-0000-0000-000000000001', '77777777-7777-7777-7777-777777777777',
   '80000000-0000-0000-0000-000000000001', 'copyright', 'Fixture report');
