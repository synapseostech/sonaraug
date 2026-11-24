-- =============================================================================
-- Medical Chronicles (migration 0130): access rule, source privacy, editorial guard
-- Users: 1111 admin, 6666 content_editor (granted here), 2222 medical_reviewer
-- (granted here), 7777 subscriber (from 08 setup), 8888 free listener.
-- =============================================================================

insert into public.platform_roles (profile_id, role) values
  ('66666666-6666-6666-6666-666666666666', 'content_editor'),
  ('22222222-2222-2222-2222-222222222222', 'medical_reviewer');

insert into public.mc_series (id, slug, title, status, published_at, requires_subscription, category_id)
values ('a1000000-0000-0000-0000-000000000001', 'cardiology-basics', 'Cardiology basics', 'published', now() - interval '30 days', true,
        (select id from public.mc_categories where slug = 'physiology'));
insert into public.mc_series (id, slug, title, status) values ('a1000000-0000-0000-0000-000000000002', 'draft-series', 'Draft series', 'draft');

-- Four published episodes (1..4) and one draft (5). Approved by the admin, edited by nobody.
insert into public.mc_episodes (id, series_id, slug, title, season, episode_number, status, approved_by, approved_version, approved_at, published_at, ai_disclosure)
select ('b1000000-0000-0000-0000-00000000000' || n)::uuid, 'a1000000-0000-0000-0000-000000000001', 'cardio-ep-' || n, 'Episode ' || n, 1, n,
       'published', '11111111-1111-1111-1111-111111111111', 1, now(), now() - make_interval(days => 10 - n), 'ai_generated'
from generate_series(1, 4) n;
insert into public.mc_episodes (id, series_id, slug, title, season, episode_number, status, ai_disclosure)
values ('b1000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000001', 'cardio-ep-5', 'Episode 5', 1, 5, 'draft', 'ai_generated');

insert into public.mc_episode_sources (episode_id, kind, url)
select ('b1000000-0000-0000-0000-00000000000' || n)::uuid, 'notebooklm_link', 'https://notebooklm.google.com/notebook/nb' || n || 'abcdef'
from generate_series(1, 5) n;

-- Visibility -----------------------------------------------------------------
begin;
select tests.as_anon();
select tests.assert_rows($q$ select 1 from public.mc_series $q$, 1, 'anon sees only published series');
select tests.assert_rows($q$ select 1 from public.mc_episodes $q$, 4, 'MC-9 anon sees only published episodes');
select tests.assert_denied($q$ select 1 from public.mc_episode_sources $q$, 'anon cannot read audio sources directly');
select tests.assert_rows($q$ select 1 from public.mc_categories $q$, 14, 'categories come from the database');
rollback;

begin;
select tests.login('88888888-8888-8888-8888-888888888888');
select tests.assert_rows($q$ select 1 from public.mc_episode_sources $q$, 0, 'a listener cannot read audio sources directly');
rollback;

-- Free allowance ----------------------------------------------------------------
begin;
select tests.as_anon();
select tests.assert_rows($q$ select 1 from public.mc_episode_playback('b1000000-0000-0000-0000-000000000001') $q$, 1, 'L-4 episode 1 is free to visitors');
select tests.assert_rows($q$ select 1 from public.mc_episode_playback('b1000000-0000-0000-0000-000000000002') $q$, 1, 'L-4 episode 2 is free to visitors');
select tests.assert_rows($q$ select 1 from public.mc_episode_playback('b1000000-0000-0000-0000-000000000003') $q$, 0, 'L-5 episode 3 is locked to visitors');
select tests.assert((select tier from public.mc_episode_access('b1000000-0000-0000-0000-000000000003')) = 'premium', 'the tier is visible without the source');
select tests.assert_rows($q$ select 1 from public.mc_episode_playback('b1000000-0000-0000-0000-000000000005') $q$, 0, 'MC-9 a draft is not playable');
rollback;

begin;
select tests.login('88888888-8888-8888-8888-888888888888');
select tests.assert_rows($q$ select 1 from public.mc_episode_playback('b1000000-0000-0000-0000-000000000003') $q$, 0, 'L-5 episode 3 is locked to a free account');
rollback;

begin;
select tests.login('77777777-7777-7777-7777-777777777777');
select tests.assert_rows($q$ select 1 from public.mc_episode_playback('b1000000-0000-0000-0000-000000000003') $q$, 1, 'L-6 a subscriber can play premium episodes');
select tests.assert_rows($q$ select 1 from public.mc_episode_playback('b1000000-0000-0000-0000-000000000005') $q$, 0, 'MC-9 not even a subscriber can play a draft');
rollback;

-- Grace, cancellation, expiry ------------------------------------------------------
begin;
update public.subscriptions set current_period_start = now() - interval '31 days', current_period_end = now() - interval '1 day'
 where id = 'd0000000-0000-0000-0000-000000000001';
select tests.login('77777777-7777-7777-7777-777777777777');
select tests.assert_rows($q$ select 1 from public.mc_episode_playback('b1000000-0000-0000-0000-000000000003') $q$, 1, 'L-7 access continues during the grace period');
reset role;
update public.subscriptions set current_period_start = now() - interval '40 days', current_period_end = now() - interval '10 days'
 where id = 'd0000000-0000-0000-0000-000000000001';
select tests.login('77777777-7777-7777-7777-777777777777');
select tests.assert_rows($q$ select 1 from public.mc_episode_playback('b1000000-0000-0000-0000-000000000003') $q$, 0, 'L-7 access ends after the grace period');
rollback;

begin;
update public.subscriptions set cancel_at_period_end = true, current_period_start = now() - interval '31 days', current_period_end = now() - interval '1 day'
 where id = 'd0000000-0000-0000-0000-000000000001';
select tests.login('77777777-7777-7777-7777-777777777777');
select tests.assert_rows($q$ select 1 from public.mc_episode_playback('b1000000-0000-0000-0000-000000000003') $q$, 0, 'P-7 a cancelled subscription gets no grace');
rollback;

begin;
insert into public.subscriptions (profile_id, plan_id, audience, status, current_period_start, current_period_end)
values ('88888888-8888-8888-8888-888888888888', 'e0000000-0000-0000-0000-000000000002', 'creator', 'active', now(), now() + interval '30 days');
select tests.login('88888888-8888-8888-8888-888888888888');
select tests.assert_rows($q$ select 1 from public.mc_episode_playback('b1000000-0000-0000-0000-000000000003') $q$, 0, 'a creator plan does not unlock premium listening');
rollback;

begin;
insert into public.entitlement_overrides (profile_id, audience, effect, reason, created_by)
values ('77777777-7777-7777-7777-777777777777', 'listener', 'revoke', 'Chargeback under investigation', '11111111-1111-1111-1111-111111111111');
select tests.login('77777777-7777-7777-7777-777777777777');
select tests.assert_rows($q$ select 1 from public.mc_episode_playback('b1000000-0000-0000-0000-000000000003') $q$, 0, 'a revoke override beats a paid subscription');
rollback;

-- Ordering, overrides, withdrawal -------------------------------------------------
begin;
update public.mc_episodes set access_override = 'premium' where id = 'b1000000-0000-0000-0000-000000000002';
update public.mc_episodes set access_override = 'free' where id = 'b1000000-0000-0000-0000-000000000004';
select tests.assert(app_private.mc_episode_tier('b1000000-0000-0000-0000-000000000002') = 'premium', 'MC-5 a premium override beats the free position');
select tests.assert(app_private.mc_episode_tier('b1000000-0000-0000-0000-000000000003') = 'premium', 'MC-6 the allowance counts positions, not free episodes');
select tests.assert(app_private.mc_episode_tier('b1000000-0000-0000-0000-000000000004') = 'free', 'MC-5 a free override beats the premium position');
rollback;

begin;
update public.mc_episodes set status = 'withdrawn', withdrawn_at = now(), withdrawn_reason = 'Correction pending' where id = 'b1000000-0000-0000-0000-000000000001';
select tests.assert(app_private.mc_episode_tier('b1000000-0000-0000-0000-000000000003') = 'free', 'MC-6 withdrawing an episode frees the next one in order');
select tests.as_anon();
select tests.assert_rows($q$ select 1 from public.mc_episode_playback('b1000000-0000-0000-0000-000000000001') $q$, 0, 'MC-7 a withdrawn episode is unavailable');
rollback;

begin;
update public.mc_series set free_episode_allowance = 0 where id = 'a1000000-0000-0000-0000-000000000001';
select tests.assert(app_private.mc_episode_tier('b1000000-0000-0000-0000-000000000001') = 'premium', 'a series allowance of 0 gates every episode');
update public.mc_series set requires_subscription = false where id = 'a1000000-0000-0000-0000-000000000001';
select tests.assert(app_private.mc_episode_tier('b1000000-0000-0000-0000-000000000004') = 'free', 'an ungated series is free');
rollback;

begin;
update public.platform_settings set value = '1' where key = 'chronicles.default_free_episode_allowance';
select tests.assert(app_private.mc_episode_tier('b1000000-0000-0000-0000-000000000002') = 'premium', 'the platform default allowance is configurable');
rollback;

begin;
update public.mc_episode_sources set status = 'unavailable', status_note = 'Share link revoked' where episode_id = 'b1000000-0000-0000-0000-000000000001';
select tests.as_anon();
select tests.assert_rows($q$ select 1 from public.mc_episode_playback('b1000000-0000-0000-0000-000000000001') $q$, 0, 'MC-7 an unavailable source is not handed out');
rollback;

-- Sources -----------------------------------------------------------------------------
begin;
select tests.assert_rejected($q$
  update public.mc_episode_sources set url = 'https://notebooklm.google.com.evil.example/notebook/abcdef1' where episode_id = 'b1000000-0000-0000-0000-000000000001'
$q$, 'mc_episode_sources', 'MC-3 a lookalike NotebookLM host is rejected');
select tests.assert_rejected($q$
  update public.mc_episode_sources set url = 'http://notebooklm.google.com/notebook/abcdef1' where episode_id = 'b1000000-0000-0000-0000-000000000001'
$q$, 'mc_episode_sources', 'MC-3 a non-https link is rejected');
select tests.assert_rejected($q$
  update public.mc_episode_sources set kind = 'authorised_url', url = 'javascript:alert(1)' where episode_id = 'b1000000-0000-0000-0000-000000000001'
$q$, 'mc_episode_sources_https', 'a script URL is rejected');
rollback;

-- Editorial guard -----------------------------------------------------------------------
begin;
select tests.login('88888888-8888-8888-8888-888888888888');
select tests.assert_denied($q$
  insert into public.mc_episodes (series_id, slug, title) values ('a1000000-0000-0000-0000-000000000001', 'sneaky', 'Sneaky')
$q$, 'a listener cannot create an episode');
select tests.assert_affected($q$ update public.mc_series set title = 'Defaced' where id = 'a1000000-0000-0000-0000-000000000001' $q$, 0, 'a listener cannot edit a series');
rollback;

begin;
select tests.login('66666666-6666-6666-6666-666666666666'); -- editor
select tests.assert_affected($q$
  insert into public.mc_episodes (id, series_id, slug, title, season, episode_number)
  values ('b1000000-0000-0000-0000-000000000009', 'a1000000-0000-0000-0000-000000000001', 'new-ep', 'New episode', 1, 9)
$q$, 1, 'MC-1 an editor can create a draft episode');
select tests.assert_rejected($q$
  insert into public.mc_episodes (series_id, slug, title, status, published_at, approved_by, approved_version)
  values ('a1000000-0000-0000-0000-000000000001', 'self-pub', 'Self published', 'published', now(), auth.uid(), 1)
$q$, 'unapproved draft', 'C-6 an editor cannot create an episode already published');
update public.mc_episodes set status = 'in_review', submitted_by = auth.uid(), submitted_at = now() where id = 'b1000000-0000-0000-0000-000000000009';
select tests.assert_rejected($q$
  update public.mc_episodes set status = 'approved', approved_by = auth.uid(), approved_version = version, approved_at = now()
  where id = 'b1000000-0000-0000-0000-000000000009'
$q$, 'only a reviewer', 'C-6 an editor cannot approve');
rollback;

begin;
reset role;
insert into public.mc_episodes (id, series_id, slug, title, season, episode_number, status, submitted_by, last_edited_by)
values ('b1000000-0000-0000-0000-000000000009', 'a1000000-0000-0000-0000-000000000001', 'new-ep', 'New episode', 1, 9,
        'in_review', '66666666-6666-6666-6666-666666666666', '66666666-6666-6666-6666-666666666666');
select tests.login('22222222-2222-2222-2222-222222222222'); -- reviewer
select tests.assert_affected($q$
  update public.mc_episodes set status = 'approved', approved_by = auth.uid(), approved_version = version, approved_at = now()
  where id = 'b1000000-0000-0000-0000-000000000009'
$q$, 1, 'MC-8 a different reviewer can approve');
select tests.assert_affected($q$
  update public.mc_episodes set status = 'published', published_at = now() where id = 'b1000000-0000-0000-0000-000000000009'
$q$, 1, 'MC-8 and publish');
reset role;
select tests.assert((select last_edited_by from public.mc_episodes where id = 'b1000000-0000-0000-0000-000000000009') = '66666666-6666-6666-6666-666666666666',
  'reviewing does not make the reviewer the editor of record');
select tests.assert_rows($q$ select 1 from public.audit_logs where entity_type = 'mc_episodes' and entity_id = 'b1000000-0000-0000-0000-000000000009' and action = 'update' $q$, 2, 'A-6 editorial decisions are audited');
rollback;

begin;
reset role;
insert into public.mc_episodes (id, series_id, slug, title, season, episode_number, status, submitted_by, last_edited_by)
values ('b1000000-0000-0000-0000-000000000009', 'a1000000-0000-0000-0000-000000000001', 'own-ep', 'Own episode', 1, 9,
        'in_review', '22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222');
select tests.login('22222222-2222-2222-2222-222222222222');
select tests.assert_rejected($q$
  update public.mc_episodes set status = 'approved', approved_by = auth.uid(), approved_version = version, approved_at = now()
  where id = 'b1000000-0000-0000-0000-000000000009'
$q$, 'self-approval', 'C-6 a reviewer cannot approve their own episode');
select tests.assert_rejected($q$
  update public.mc_episodes set status = 'approved', approved_by = '11111111-1111-1111-1111-111111111111', approved_version = version
  where id = 'b1000000-0000-0000-0000-000000000009'
$q$, 'only as themselves', 'a reviewer cannot record someone else as approver');
rollback;

begin;
reset role;
insert into public.mc_episodes (id, series_id, slug, title, season, episode_number, status, submitted_by, last_edited_by, approved_by, approved_version, approved_at)
values ('b1000000-0000-0000-0000-000000000009', 'a1000000-0000-0000-0000-000000000001', 'stale-ep', 'Stale episode', 1, 9,
        'approved', '66666666-6666-6666-6666-666666666666', '66666666-6666-6666-6666-666666666666', '11111111-1111-1111-1111-111111111111', 1, now());
update public.mc_episodes set version = 2 where id = 'b1000000-0000-0000-0000-000000000009';
select tests.assert_rejected($q$
  update public.mc_episodes set status = 'published', published_at = now() where id = 'b1000000-0000-0000-0000-000000000009'
$q$, 'stale approval', 'publishing needs an approval of the current version');
rollback;

begin;
select tests.login('66666666-6666-6666-6666-666666666666');
select tests.assert_denied($q$ delete from public.mc_episodes where id = 'b1000000-0000-0000-0000-000000000001' $q$, 'medical content is withdrawn, never deleted');
select tests.assert_rows($q$ select 1 from public.mc_episode_playback('b1000000-0000-0000-0000-000000000005') $q$, 1, 'staff can preview a draft');
rollback;

begin;
select tests.login('66666666-6666-6666-6666-666666666666');
select tests.assert_affected($q$ update public.mc_categories set name = 'Renamed' where slug = 'anatomy' $q$, 0, 'an editor cannot manage categories');
rollback;
begin;
select tests.login('11111111-1111-1111-1111-111111111111');
select tests.assert_affected($q$ update public.mc_categories set is_active = false, sort_order = 1 where slug = 'anatomy' $q$, 1, 'A-2 an admin can reorder and deactivate categories');
rollback;
