-- =============================================================================
-- Regression suite for the 2026-11-22 engineering audit (F-1 .. F-15, database-level subset).
-- Every exploit below succeeded against migrations 0001-0100. Each must now be
-- refused, and each legitimate path next to it must still work.
-- See docs/SONARA_SECURITY_STATUS.md for the narrative per finding.
-- =============================================================================

-- F-1 Broadcaster verification ------------------------------------------------
begin;
reset role;
select tests.login('55555555-5555-5555-5555-555555555555'); -- owner B, unverified org
select tests.assert_denied($q$
  update public.organisations set verification_status = 'verified', verified_at = now()
  where id = 'bbbbbbbb-0000-0000-0000-000000000002'
$q$, 'F-1 an owner cannot verify their own organisation');
select tests.assert_affected($q$
  update public.organisations set description = 'Community radio for the west'
  where id = 'bbbbbbbb-0000-0000-0000-000000000002'
$q$, 1, 'F-1 an owner can still edit ordinary organisation details');
rollback;

begin;
reset role;
select tests.login('88888888-8888-8888-8888-888888888888');
select tests.assert_denied($q$
  insert into public.organisations (slug, legal_name, org_type, contact_email, verification_status, verified_at, created_by)
  values ('self-verified-fm', 'Self Verified', 'broadcaster', 'a@b.example', 'verified', now(), auth.uid())
$q$, 'F-1 a new organisation cannot be created already verified');
select tests.assert_affected($q$
  insert into public.organisations (slug, legal_name, org_type, contact_email, created_by)
  values ('honest-fm', 'Honest FM', 'broadcaster', 'a@b.example', auth.uid())
$q$, 1, 'F-1 anyone can still register an unverified organisation');
rollback;

begin;
reset role;
select tests.login('11111111-1111-1111-1111-111111111111'); -- platform admin
select tests.assert_affected($q$
  update public.organisations set verification_status = 'verified', verified_at = now()
  where id = 'bbbbbbbb-0000-0000-0000-000000000002'
$q$, 1, 'F-1 a platform admin can verify an organisation');
rollback;

-- F-2 Stream playability ------------------------------------------------------
begin;
reset role;
select tests.login('44444444-4444-4444-4444-444444444444'); -- editor A
select tests.assert_denied($q$
  update public.station_streams set status = 'playable', last_verified_at = now()
  where id = '20000000-0000-0000-0000-000000000002'
$q$, 'F-2 an editor cannot mark an unprobed stream playable');
select tests.assert_denied($q$
  insert into public.station_streams (station_id, protocol, url, status, last_verified_at)
  values ('10000000-0000-0000-0000-000000000002', 'icecast', 'https://x.example/l', 'playable', now())
$q$, 'F-2 a new endpoint cannot be inserted as playable');
select tests.assert_affected($q$
  insert into public.station_streams (station_id, protocol, url)
  values ('10000000-0000-0000-0000-000000000002', 'icecast', 'https://backup.alpha.example/news')
$q$, 1, 'F-2 an editor can still register a new endpoint for probing');

-- Redirecting a verified, public endpoint voids its verification (was a hijack path).
update public.station_streams set url = 'https://attacker.example/hijack'
 where id = '20000000-0000-0000-0000-000000000001';
reset role;
select tests.assert_rows($q$
  select 1 from public.station_streams
  where id = '20000000-0000-0000-0000-000000000001' and status = 'registered' and last_verified_at is null
$q$, 1, 'F-2 changing a stream URL resets it to registered for re-probing');
select tests.as_anon();
select tests.assert_rows($q$ select 1 from public.station_streams where url like '%attacker%' $q$, 0,
  'F-2 an edited, unprobed URL is never served to listeners');
rollback;

begin;
reset role;
select tests.login('33333333-3333-3333-3333-333333333333'); -- owner A
select tests.assert_affected($q$
  update public.station_streams set status = 'revoked' where id = '20000000-0000-0000-0000-000000000001'
$q$, 1, 'F-2 an owner can still withdraw their own endpoint');
rollback;

-- F-3 Rights verification + full self-publish chain ---------------------------
begin;
reset role;
select tests.login('33333333-3333-3333-3333-333333333333');
select tests.assert_denied($q$
  insert into public.rights_records (station_id, rights_holder_name, licence_type, verified_by, verified_at)
  values ('10000000-0000-0000-0000-000000000002', 'Alpha', 'broadcaster_authorised', auth.uid(), now())
$q$, 'F-3 an owner cannot insert pre-verified rights evidence');
-- Editing verified evidence sends it back for review.
update public.rights_records set valid_to = current_date + 365
 where station_id = '10000000-0000-0000-0000-000000000001';
select tests.assert_rows($q$
  select 1 from public.rights_records
  where station_id = '10000000-0000-0000-0000-000000000001' and verified_at is null and verified_by is null
$q$, 1, 'F-3 a tenant edit clears the staff verification');
reset role;
select tests.as_anon();
select tests.assert_rows($q$ select 1 from public.stations where slug = 'alpha-fm' $q$, 0,
  'F-3/F-11 a station whose rights evidence is back under review leaves the public directory');
rollback;

begin;
reset role;
select tests.login('55555555-5555-5555-5555-555555555555'); -- the full chain that used to succeed
select tests.assert_denied($q$
  update public.organisations set verification_status = 'verified', verified_at = now()
  where id = 'bbbbbbbb-0000-0000-0000-000000000002'
$q$, 'F-1..3 chain step 1 (self-verify) is refused');
select tests.assert_denied($q$
  insert into public.station_streams (station_id, protocol, url, is_primary, status, last_verified_at)
  values ('10000000-0000-0000-0000-000000000003', 'icecast', 'https://attacker.example/x', true, 'playable', now())
$q$, 'F-1..3 chain step 2 (self-playable stream) is refused');
select tests.assert_rejected($q$
  update public.stations set status = 'published', published_at = now()
  where id = '10000000-0000-0000-0000-000000000003'
$q$, 'not verified', 'F-1..3 chain final step (publish) is refused');
rollback;

-- F-4 Invitation acceptance ---------------------------------------------------
begin;
reset role;
select tests.login('77777777-7777-7777-7777-777777777777'); -- pending editor invitee at org B
select tests.assert_rows($q$ select 1 from public.organisation_members where profile_id = auth.uid() $q$, 1,
  'F-4 an invitee can see their own pending invitation');
select tests.assert_denied($q$
  update public.organisation_members set role = 'admin', accepted_at = now()
$q$, 'F-4 an invitee cannot accept with a higher role than offered');
select tests.assert_denied($q$
  update public.organisation_members set org_id = 'aaaaaaaa-0000-0000-0000-000000000001', accepted_at = now()
$q$, 'F-4 an invitee cannot move their invitation into another organisation');
select tests.assert_affected($q$
  update public.organisation_members set accepted_at = now()
  where org_id = 'bbbbbbbb-0000-0000-0000-000000000002' and profile_id = auth.uid()
$q$, 1, 'F-4 an invitee can accept the role they were offered');
select tests.assert(
  app_private.has_org_role('bbbbbbbb-0000-0000-0000-000000000002', array['editor']::public.org_member_role[]),
  'F-4 acceptance grants exactly the offered role');
rollback;

-- Token-based invitations.
begin;
reset role;
insert into public.organisation_invitations (org_id, email, role, invited_by, token_hash, expires_at)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'listener2@example.invalid', 'presenter',
        '33333333-3333-3333-3333-333333333333',
        encode(sha256(convert_to('raw-invite-token-0001', 'UTF8')), 'hex'), now() + interval '7 days');
select tests.login('77777777-7777-7777-7777-777777777777');
select set_config('request.jwt.claims', '{"email":"listener1@example.invalid"}', true);
select tests.assert_denied($q$ select public.accept_organisation_invitation('raw-invite-token-0001') $q$,
  'F-4 an invitation cannot be redeemed by a different email address');
select tests.login('88888888-8888-8888-8888-888888888888');
select set_config('request.jwt.claims', '{"email":"listener2@example.invalid"}', true);
select tests.assert_denied($q$ select public.accept_organisation_invitation('wrong-token') $q$,
  'F-4 a wrong token is refused');
select tests.assert(
  public.accept_organisation_invitation('raw-invite-token-0001') = 'aaaaaaaa-0000-0000-0000-000000000001',
  'F-4 the invited email can redeem the token');
select tests.assert(
  app_private.has_org_role('aaaaaaaa-0000-0000-0000-000000000001', array['presenter']::public.org_member_role[]),
  'F-4 token acceptance grants the invitation role');
select tests.assert_denied($q$ select public.accept_organisation_invitation('raw-invite-token-0001') $q$,
  'F-4 a token cannot be redeemed twice');
rollback;

-- F-5 Organisation takeover ---------------------------------------------------
begin;
reset role;
insert into public.organisations (id, slug, legal_name, org_type, contact_email, created_by)
values ('dddddddd-0000-0000-0000-000000000004', 'ownerless-fm', 'Ownerless FM Ltd', 'broadcaster', 'x@o.example', null);
select tests.login('88888888-8888-8888-8888-888888888888');
select tests.assert_denied($q$
  insert into public.organisation_members (org_id, profile_id, role, accepted_at)
  values ('dddddddd-0000-0000-0000-000000000004', auth.uid(), 'owner', now())
$q$, 'F-5 a stranger cannot claim an organisation they did not create');
insert into public.organisations (id, slug, legal_name, org_type, contact_email, created_by)
values ('eeeeeeee-0000-0000-0000-000000000005', 'my-own-fm', 'My Own FM', 'broadcaster', 'e@e.example', auth.uid());
select tests.assert_denied($q$
  insert into public.organisation_members (org_id, profile_id, role, accepted_at)
  values ('eeeeeeee-0000-0000-0000-000000000005', auth.uid(), 'owner', null)
$q$, 'F-5 a pending owner row (the takeover vehicle) cannot be created');
select tests.assert_affected($q$
  insert into public.organisation_members (org_id, profile_id, role, accepted_at)
  values ('eeeeeeee-0000-0000-0000-000000000005', auth.uid(), 'owner', now())
$q$, 1, 'F-5 the founder can still become the first owner');
select tests.assert_denied($q$
  update public.organisation_members set org_id = 'aaaaaaaa-0000-0000-0000-000000000001'
$q$, 'F-5 a membership cannot be moved into a victim organisation');
select tests.assert_rows($q$ select 1 from public.rss_feeds $q$, 0,
  'F-5 the stranger still sees no private data of org A');
rollback;

begin;
reset role;
insert into public.organisation_members (org_id, profile_id, role, accepted_at)
values ('aaaaaaaa-0000-0000-0000-000000000001', '88888888-8888-8888-8888-888888888888', 'admin', now());
select tests.login('88888888-8888-8888-8888-888888888888'); -- a legitimate admin of org A
select tests.assert_denied($q$
  update public.organisation_members set role = 'editor'
  where org_id = 'aaaaaaaa-0000-0000-0000-000000000001' and profile_id = '33333333-3333-3333-3333-333333333333'
$q$, 'F-5 an admin cannot demote the owner');
select tests.assert_denied($q$
  delete from public.organisation_members
  where org_id = 'aaaaaaaa-0000-0000-0000-000000000001' and profile_id = '33333333-3333-3333-3333-333333333333'
$q$, 'F-5 an admin cannot remove the owner');
select tests.assert_affected($q$
  update public.organisation_members set role = 'presenter'
  where org_id = 'aaaaaaaa-0000-0000-0000-000000000001' and profile_id = '44444444-4444-4444-4444-444444444444'
$q$, 1, 'F-5 an admin can still change an ordinary member''s role');
rollback;

-- F-6 Consent privacy ---------------------------------------------------------
begin;
reset role;
update public.profiles set handle = 'listener_one', analytics_consent = true
 where id = '77777777-7777-7777-7777-777777777777';
select tests.as_anon();
select tests.assert_rows($q$ select display_name from public.profiles where handle = 'listener_one' $q$, 1,
  'F-6 public profile fields remain readable');
select tests.assert_denied($q$ select analytics_consent from public.profiles $q$,
  'F-6 the public cannot read consent flags');
select tests.assert_denied($q$ select is_anonymous, status, locale, country_code from public.profiles $q$,
  'F-6 the public cannot read account fields');
reset role;
select tests.login('88888888-8888-8888-8888-888888888888');
select tests.assert_denied($q$ select ads_consent from public.profiles where handle = 'listener_one' $q$,
  'F-6 another signed-in user cannot read consent flags');
reset role;
select tests.login('77777777-7777-7777-7777-777777777777');
select tests.assert((public.get_my_profile()).analytics_consent, 'F-6 a listener can read their own consent');
select tests.assert_affected($q$ update public.profiles set ads_consent = true where id = auth.uid() $q$, 1,
  'F-6 a listener can still change their own consent');
rollback;

-- F-7 Media metadata exposure -------------------------------------------------
begin;
reset role;
insert into public.media_assets (id, kind, storage_backend, storage_key, mime_type, status, owner_org_id, size_bytes, metadata)
values ('50000000-0000-0000-0000-0000000000d1', 'image', 'r2', 'org/bbbbbbbb-0000-0000-0000-000000000002/kyc/licence.jpg',
        'image/jpeg', 'ready', 'bbbbbbbb-0000-0000-0000-000000000002', 1000, '{"exif_gps":"0.31,32.58"}');
select tests.as_anon();
select tests.assert_rows($q$ select 1 from public.media_assets where id = '50000000-0000-0000-0000-0000000000d1' $q$, 0,
  'F-7 a ready image that is not flagged public (e.g. a licence scan) is not readable');
select tests.assert_rows($q$ select 1 from public.media_assets $q$, 1,
  'F-7 flagged public artwork is still readable');
select tests.assert_denied($q$ select storage_key from public.media_assets $q$,
  'F-7 object keys are never readable by the public');
select tests.assert_denied($q$ select metadata from public.media_assets $q$,
  'F-7 free-form media metadata is never readable by the public');
reset role;
select tests.login('44444444-4444-4444-4444-444444444444');
select tests.assert_denied($q$ select storage_key from public.media_assets $q$,
  'F-7 object keys are not readable by signed-in clients either (signed URLs only)');
rollback;

-- F-8 Partitions --------------------------------------------------------------
begin;
reset role;
insert into public.playback_events (profile_id, station_id, event_type, session_id)
values ('77777777-7777-7777-7777-777777777777', '10000000-0000-0000-0000-000000000001', 'play', gen_random_uuid());
insert into public.stream_health_checks (stream_id, ok) values ('20000000-0000-0000-0000-000000000001', true);
select tests.as_anon();
select tests.assert_denied($q$ select * from public.playback_events_default $q$,
  'F-8 the public cannot read listener events through the partition');
select tests.assert_denied($q$ select * from public.stream_health_checks_default $q$,
  'F-8 the public cannot read health checks through the partition');
select tests.assert_affected($q$
  insert into public.playback_events (station_id, event_type) values ('10000000-0000-0000-0000-000000000001', 'play')
$q$, 1, 'F-8 anonymous playback telemetry still works through the parent');
reset role;
select tests.login('44444444-4444-4444-4444-444444444444');
select tests.assert_denied($q$ delete from public.stream_health_checks_default $q$,
  'F-8 a tenant cannot delete monitor evidence through the partition');
select tests.assert_denied($q$
  insert into public.stream_health_checks_default (stream_id, ok) values ('20000000-0000-0000-0000-000000000002', true)
$q$, 'F-8 a tenant cannot forge monitor evidence through the partition');
select tests.assert_denied($q$ delete from public.playback_events_default $q$,
  'F-8 a tenant cannot delete other listeners'' events through the partition');
rollback;

-- F-13 Media pipeline bypass ---------------------------------------------------
begin;
reset role;
select tests.login('44444444-4444-4444-4444-444444444444'); -- editor A
select tests.assert_denied($q$
  insert into public.media_assets (kind, storage_backend, storage_key, mime_type, status, owner_org_id)
  values ('audio', 'r2', 'org/aaaaaaaa-0000-0000-0000-000000000001/a.mp3', 'audio/mpeg', 'ready', 'aaaaaaaa-0000-0000-0000-000000000001')
$q$, 'F-13 a client cannot register media as already processed');
select tests.assert_denied($q$
  insert into public.media_assets (kind, storage_backend, storage_key, mime_type, owner_org_id)
  values ('audio', 'r2', 'org/bbbbbbbb-0000-0000-0000-000000000002/steal.mp3', 'audio/mpeg', 'aaaaaaaa-0000-0000-0000-000000000001')
$q$, 'F-13 a client cannot register an object key outside its own prefix');
select tests.assert_denied($q$
  update public.media_assets set status = 'processing' where id = '50000000-0000-0000-0000-000000000002'
$q$, 'F-13 a client cannot change pipeline status');
select tests.assert_denied($q$
  update public.media_assets set is_public = true where id = '50000000-0000-0000-0000-000000000001'
$q$, 'F-13 a client cannot publish an asset by flagging it public');
select tests.assert_affected($q$
  insert into public.media_assets (kind, storage_backend, storage_key, mime_type, owner_org_id)
  values ('audio', 'r2', 'org/aaaaaaaa-0000-0000-0000-000000000001/upload.mp3', 'audio/mpeg', 'aaaaaaaa-0000-0000-0000-000000000001')
$q$, 1, 'F-13 a member can still register a pending upload under their org prefix');
rollback;

-- F-14 Creator trust fields ---------------------------------------------------
begin;
reset role;
select tests.login('88888888-8888-8888-8888-888888888888');
select tests.assert_denied($q$
  insert into public.creators (profile_id, display_name, verification_status, monetisation_status)
  values (auth.uid(), 'Fake', 'verified', 'active')
$q$, 'F-14 a creator profile cannot be created pre-verified or monetised');
select tests.assert_affected($q$
  insert into public.creators (profile_id, display_name) values (auth.uid(), 'Honest Creator')
$q$, 1, 'F-14 anyone can still apply as a creator');
reset role;
select tests.login('66666666-6666-6666-6666-666666666666');
select tests.assert_denied($q$
  update public.creator_channels set is_verified = true where id = '40000000-0000-0000-0000-000000000001'
$q$, 'F-14 a creator cannot award their own verified badge');
select tests.assert_denied($q$
  update public.videos set view_count_cached = 999999 where id = '80000000-0000-0000-0000-000000000001'
$q$, 'F-14 a creator cannot inflate view counts');
select tests.assert_denied($q$
  update public.creators set monetisation_status = 'active' where profile_id = auth.uid()
$q$, 'F-14 a creator cannot switch on their own monetisation');
rollback;

-- F-11 Rights must remain in force while public ------------------------------
begin;
reset role;
update public.rights_records set valid_from = current_date - 30, valid_to = current_date - 1
 where station_id = '10000000-0000-0000-0000-000000000001';
select tests.as_anon();
select tests.assert_rows($q$ select 1 from public.stations where slug = 'alpha-fm' $q$, 0,
  'F-11 a published station disappears when its licence expires');
select tests.assert_rows($q$ select 1 from public.station_streams $q$, 0,
  'F-11 its stream URL is no longer served');
rollback;
