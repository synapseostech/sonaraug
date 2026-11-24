-- =============================================================================
-- Listener (anonymous) visibility: only what is approved, published and playable.
-- =============================================================================
begin;
reset role;
select tests.as_anon();

select tests.assert_rows($q$ select 1 from public.stations $q$, 1,
  'anonymous visitors see only the published station');
select tests.assert_rows($q$ select 1 from public.stations where slug = 'alpha-news' $q$, 0,
  'draft stations are invisible to the public');
select tests.assert_rows($q$ select 1 from public.stations where slug = 'beta-fm' $q$, 0,
  'stations of unverified organisations are invisible to the public');

select tests.assert_rows($q$ select 1 from public.station_streams $q$, 1,
  'only probed-playable stream endpoints are exposed');
select tests.assert_rows($q$ select 1 from public.station_streams where status = 'registered' $q$, 0,
  'registered-but-unverified endpoints must never be served');

select tests.assert_rows($q$ select 1 from public.podcasts $q$, 1,
  'published podcasts are public');
select tests.assert_rows($q$ select 1 from public.podcasts where slug = 'alpha-draft' $q$, 0,
  'draft podcasts are hidden');

select tests.assert_rows($q$ select 1 from public.podcast_episodes $q$, 1,
  'published episodes are public');
select tests.assert_rows($q$ select 1 from public.podcast_episodes where status = 'draft' $q$, 0,
  'draft episodes are hidden');

select tests.assert_rows($q$ select 1 from public.videos $q$, 1,
  'published public videos are visible');
select tests.assert_rows($q$ select 1 from public.videos where slug like 'vlog-%' and status <> 'published' $q$, 0,
  'draft videos are hidden');

-- Operational and commercial data must never leak to the public.
select tests.assert_rows($q$ select 1 from public.rss_feeds $q$, 0, 'RSS feed URLs are not public');
select tests.assert_rows($q$ select 1 from public.impressions $q$, 0, 'impressions are not public');
select tests.assert_rows($q$ select 1 from public.campaigns $q$, 0, 'campaigns are not public');
select tests.assert_rows($q$ select 1 from public.audit_logs $q$, 0, 'audit logs are not public');
select tests.assert_rows($q$ select 1 from public.stream_health_checks $q$, 0, 'health checks are not public');
select tests.assert_rows($q$ select 1 from public.organisation_invitations $q$, 0, 'invitations are not public');

-- Artwork is public; masters are not. Exactly one ready image exists.
select tests.assert_rows($q$ select 1 from public.media_assets $q$, 1,
  'anonymous visitors can read public artwork only');
select tests.assert_rows($q$ select 1 from public.media_assets where kind = 'audio' $q$, 0,
  'audio masters are never readable by the public');

-- Reporting must be possible without an account.
insert into public.content_reports (reporter_contact, video_id, reason, details)
values ('witness@example.invalid', '80000000-0000-0000-0000-000000000001', 'copyright', 'anonymous report');
select tests.assert_rows($q$ select 1 from public.content_reports $q$, 0,
  'anonymous reporters cannot read the report queue back');

rollback;
