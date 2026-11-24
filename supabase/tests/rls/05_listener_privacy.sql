-- =============================================================================
-- A listener's own data is theirs: history, favourites, playlists, progress.
-- =============================================================================
begin;
reset role;
select tests.login('77777777-7777-7777-7777-777777777777'); -- listener one

select tests.assert_rows($q$ select 1 from public.favourites $q$, 1, 'listener sees their own favourites');
select tests.assert_rows($q$ select 1 from public.playback_progress $q$, 1, 'listener sees their own resume point');

select tests.assert_denied($q$
  insert into public.favourites (profile_id, station_id)
  values ('88888888-8888-8888-8888-888888888888', '10000000-0000-0000-0000-000000000001')
$q$, 'a listener cannot write favourites onto another profile');

select tests.assert_affected($q$
  update public.playback_progress set position_seconds = 1
    where profile_id = '88888888-8888-8888-8888-888888888888' returning 1
$q$, 0, 'a listener cannot alter another listener''s progress');

rollback;

begin;
reset role;
select tests.login('88888888-8888-8888-8888-888888888888'); -- listener two

select tests.assert_rows($q$ select 1 from public.favourites $q$, 0,
  'listener two sees none of listener one''s favourites');
select tests.assert_rows($q$ select 1 from public.playback_progress $q$, 0,
  'listener two sees none of listener one''s history');
select tests.assert_rows($q$ select 1 from public.playlists $q$, 0,
  'listener two sees none of listener one''s playlists');

rollback;

begin;
reset role;
select tests.as_anon();

select tests.assert_rows($q$ select 1 from public.comments $q$, 1,
  'anonymous visitors see only visible comments');
select tests.assert_rows($q$ select 1 from public.comments where status = 'hidden' $q$, 0,
  'hidden comments are invisible to the public');
select tests.assert_rows($q$ select 1 from public.favourites $q$, 0,
  'favourites are private');

-- Playback telemetry may be recorded anonymously, without identifying anyone.
insert into public.playback_events (station_id, event_type, platform)
values ('10000000-0000-0000-0000-000000000001', 'play', 'android');
select tests.assert_rows($q$ select 1 from public.playback_events $q$, 0,
  'anonymous listeners cannot read playback telemetry back');

rollback;
