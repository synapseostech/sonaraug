-- =============================================================================
-- Publishing rules: no unverified org, no dead stream, no unlicensed station
-- may ever appear in the directory.
-- =============================================================================
begin;
reset role;
select tests.login('33333333-3333-3333-3333-333333333333'); -- owner A (verified org)

-- An owner can create a draft.
insert into public.stations (id, org_id, slug, name, category_id, language_codes, status)
values ('10000000-0000-0000-0000-0000000000aa', 'aaaaaaaa-0000-0000-0000-000000000001',
        'gate-test', 'Gate Test FM', 'music', '{en}', 'draft');

-- ...but publishing without a playable stream is refused.
select tests.assert_rejected($q$
  update public.stations set status = 'published' where id = '10000000-0000-0000-0000-0000000000aa'
$q$, 'no playable stream', 'publishing is blocked when no endpoint has been probed playable');

-- A probationary (registered, unverified) endpoint does not count as playable.
insert into public.station_streams (station_id, protocol, url, is_primary, status)
values ('10000000-0000-0000-0000-0000000000aa', 'icecast',
        'https://stream.alpha.example/gate', true, 'registered');

select tests.assert_rejected($q$
  update public.stations set status = 'published' where id = '10000000-0000-0000-0000-0000000000aa'
$q$, 'no playable stream', 'a merely registered endpoint cannot unlock publishing');

-- Owners may record the broadcaster authorisation (as unverified evidence).
insert into public.rights_records (station_id, rights_holder_name, licence_type, territory_codes)
values ('10000000-0000-0000-0000-0000000000aa', 'Alpha Broadcasting Ltd', 'broadcaster_authorised', '{UG}');

-- ...but cannot mark their own evidence as verified (audit F-3).
select tests.assert_denied($q$
  update public.rights_records set verified_by = auth.uid(), verified_at = now()
  where station_id = '10000000-0000-0000-0000-0000000000aa'
$q$, 'an owner cannot verify their own rights record');

-- Still blocked: the stream has not been verified.
select tests.assert_rejected($q$
  update public.stations set status = 'published' where id = '10000000-0000-0000-0000-0000000000aa'
$q$, 'no playable stream', 'a stream must be playable before the station can publish');

-- The owner cannot declare their own endpoint playable (audit F-2).
select tests.assert_denied($q$
  update public.station_streams set status = 'playable', last_verified_at = now()
  where station_id = '10000000-0000-0000-0000-0000000000aa'
$q$, 'an owner cannot mark their own stream playable');

-- The stream monitor (service role) marks the endpoint playable.
reset role;
update public.station_streams
   set status = 'playable', last_verified_at = now()
 where station_id = '10000000-0000-0000-0000-0000000000aa';
select tests.login('33333333-3333-3333-3333-333333333333');

-- Still blocked: the rights evidence has not been verified by staff.
select tests.assert_rejected($q$
  update public.stations set status = 'published' where id = '10000000-0000-0000-0000-0000000000aa'
$q$, 'no rights record', 'unverified rights evidence cannot unlock publishing');

-- A platform admin verifies the rights evidence.
select tests.login('11111111-1111-1111-1111-111111111111');
select tests.assert_affected($q$
  update public.rights_records set verified_by = auth.uid(), verified_at = now()
  where station_id = '10000000-0000-0000-0000-0000000000aa'
$q$, 1, 'a platform admin can verify rights evidence');
select tests.login('33333333-3333-3333-3333-333333333333');

update public.stations set status = 'published' where id = '10000000-0000-0000-0000-0000000000aa';
select tests.assert_rows($q$
  select 1 from public.stations
  where id = '10000000-0000-0000-0000-0000000000aa' and status = 'published' and published_at is not null
$q$, 1, 'a station with a verified stream and a rights record publishes successfully');

rollback;

-- Rights must be in force today, for Uganda.
begin;
reset role;
-- Setup as trusted writers: monitor-verified stream, staff-verified (but expired) rights.
insert into public.stations (id, org_id, slug, name, category_id, language_codes, status)
values ('10000000-0000-0000-0000-0000000000bb', 'aaaaaaaa-0000-0000-0000-000000000001',
        'expired-rights', 'Expired Rights FM', 'music', '{en}', 'draft');

insert into public.station_streams (station_id, protocol, url, is_primary, status, last_verified_at)
values ('10000000-0000-0000-0000-0000000000bb', 'icecast',
        'https://stream.alpha.example/expired', true, 'playable', now());

insert into public.rights_records (station_id, rights_holder_name, licence_type, territory_codes, valid_from, valid_to, verified_by, verified_at)
values ('10000000-0000-0000-0000-0000000000bb', 'Alpha Broadcasting Ltd', 'broadcaster_authorised',
        '{UG}', current_date - 400, current_date - 10, '11111111-1111-1111-1111-111111111111', now());

select tests.login('33333333-3333-3333-3333-333333333333');

select tests.assert_rejected($q$
  update public.stations set status = 'published' where id = '10000000-0000-0000-0000-0000000000bb'
$q$, 'no rights record', 'an expired licence blocks publishing');

-- A licence that excludes Uganda must also block (edited by staff, so it stays verified).
reset role;
update public.rights_records
   set valid_from = current_date - 10, valid_to = null, territory_codes = '{KE}'
 where station_id = '10000000-0000-0000-0000-0000000000bb';
select tests.login('33333333-3333-3333-3333-333333333333');

select tests.assert_rejected($q$
  update public.stations set status = 'published' where id = '10000000-0000-0000-0000-0000000000bb'
$q$, 'no rights record', 'a licence for another territory blocks publishing');

rollback;

-- An unverified organisation cannot publish at all, even with everything else.
begin;
reset role;
-- Everything else in place, set up by trusted writers.
insert into public.rights_records (station_id, rights_holder_name, licence_type, territory_codes, verified_by, verified_at)
values ('10000000-0000-0000-0000-000000000003', 'Beta Broadcasting Ltd', 'broadcaster_authorised', '{UG}',
        '11111111-1111-1111-1111-111111111111', now());
insert into public.station_streams (station_id, protocol, url, is_primary, status, last_verified_at)
values ('10000000-0000-0000-0000-000000000003', 'icecast', 'https://stream.beta.example/live', true, 'playable', now());

select tests.login('55555555-5555-5555-5555-555555555555'); -- owner B (unverified org)

select tests.assert_rejected($q$
  update public.stations set status = 'published' where id = '10000000-0000-0000-0000-000000000003'
$q$, 'not verified', 'an unverified broadcaster cannot publish');

rollback;

-- Inserting an already-published row is gated by the same trigger.
begin;
reset role;
select tests.login('33333333-3333-3333-3333-333333333333');
select tests.assert_rejected($q$
  insert into public.stations (org_id, slug, name, category_id, language_codes, status, published_at)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'sneaky-publish', 'Sneaky FM', 'music', '{en}', 'published', now())
$q$, 'no playable stream', 'a station cannot be created directly in the published state');
rollback;
