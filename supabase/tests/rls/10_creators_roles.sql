-- =============================================================================
-- Creator applications, notifications and role grants (migration 0140)
-- Users: 1111 admin, 2222 moderator, 7777/8888 listeners.
-- =============================================================================

-- Role grants -------------------------------------------------------------------
begin;
select tests.login('11111111-1111-1111-1111-111111111111'); -- admin, not super_admin
select tests.assert_rejected($q$ select public.grant_platform_role(auth.uid(), 'super_admin') $q$, 'your own roles', 'A-5 an admin cannot escalate themselves');
select tests.assert_rejected($q$ select public.grant_platform_role('88888888-8888-8888-8888-888888888888', 'admin') $q$, 'super administrator', 'an admin cannot create admins');
select public.grant_platform_role('88888888-8888-8888-8888-888888888888', 'finance');
select tests.assert_rows($q$ select 1 from public.platform_roles where profile_id = '88888888-8888-8888-8888-888888888888' and role = 'finance' $q$, 1, 'an admin can grant an operational role');
select tests.assert_rows($q$ select 1 from public.audit_logs where entity_type = 'platform_roles' and action = 'insert'
  and after ->> 'profile_id' = '88888888-8888-8888-8888-888888888888' and after ->> 'granted_by' = '11111111-1111-1111-1111-111111111111' $q$, 1, 'A-6 role grants are audited');
rollback;

begin;
select tests.login('77777777-7777-7777-7777-777777777777');
select tests.assert_rejected($q$ select public.grant_platform_role('88888888-8888-8888-8888-888888888888', 'moderator') $q$, 'only administrators', 'A-4 a listener cannot grant roles');
select tests.assert_denied($q$ insert into public.platform_roles (profile_id, role) values (auth.uid(), 'super_admin') $q$, 'a listener cannot write roles directly');
rollback;

begin;
insert into public.platform_roles (profile_id, role) values ('33333333-3333-3333-3333-333333333333', 'super_admin');
select tests.login('33333333-3333-3333-3333-333333333333');
select public.grant_platform_role('88888888-8888-8888-8888-888888888888', 'admin');
select tests.assert_rejected($q$ select public.revoke_platform_role('33333333-3333-3333-3333-333333333333', 'super_admin') $q$, 'your own roles', 'a super admin cannot demote themselves');
reset role;
insert into public.platform_roles (profile_id, role) values ('44444444-4444-4444-4444-444444444444', 'super_admin');
select tests.login('44444444-4444-4444-4444-444444444444');
select public.revoke_platform_role('33333333-3333-3333-3333-333333333333', 'super_admin');
-- 4444 is now the only super_admin.
select tests.assert_rejected($q$ select public.revoke_platform_role('55555555-5555-5555-5555-555555555555', 'super_admin') $q$, 'last super administrator', 'the last super administrator cannot be removed');
rollback;

begin;
insert into public.platform_roles (profile_id, role) values ('33333333-3333-3333-3333-333333333333', 'super_admin');
insert into public.platform_roles (profile_id, role) values ('44444444-4444-4444-4444-444444444444', 'admin');
select tests.login('33333333-3333-3333-3333-333333333333');
-- 3333 is the only super_admin; 4444 is admin and cannot touch it either.
reset role;
select tests.login('44444444-4444-4444-4444-444444444444');
select tests.assert_rejected($q$ select public.revoke_platform_role('33333333-3333-3333-3333-333333333333', 'super_admin') $q$, 'super administrator', 'an admin cannot demote a super admin');
rollback;

-- Creator applications ----------------------------------------------------------------
begin;
select tests.login('77777777-7777-7777-7777-777777777777');
select tests.assert_rejected($q$
  insert into public.creator_applications (profile_id, display_name, biography, content_category, show_proposal, rights_declaration, terms_version, status)
  values (auth.uid(), 'Self Approved', repeat('bio ', 10), 'health', repeat('show ', 10), true, '2026-11', 'approved')
$q$, 'unreviewed', 'C-2 an application cannot be created already approved');
select tests.assert_affected($q$
  insert into public.creator_applications (id, profile_id, display_name, biography, content_category, show_proposal, rights_declaration, terms_version)
  values ('c1000000-0000-0000-0000-000000000001', auth.uid(), 'Listener One', repeat('bio ', 10), 'health', repeat('show ', 10), true, '2026-11')
$q$, 1, 'C-1 a user can apply to become a creator');
select tests.assert_rejected($q$
  update public.creator_applications set status = 'approved' where id = 'c1000000-0000-0000-0000-000000000001'
$q$, 'only withdraw', 'C-2 an applicant cannot approve themselves');
select tests.assert_rejected($q$
  insert into public.creator_applications (profile_id, display_name, biography, content_category, show_proposal, rights_declaration, terms_version)
  values (auth.uid(), 'Listener One', repeat('bio ', 10), 'health', repeat('show ', 10), false, '2026-11')
$q$, 'creator_applications_rights', 'a rights declaration is required');
reset role;
select tests.login('88888888-8888-8888-8888-888888888888');
select tests.assert_rows($q$ select 1 from public.creator_applications $q$, 0, 'applications are private to the applicant and staff');
reset role;
select tests.login('22222222-2222-2222-2222-222222222222'); -- moderator
select tests.assert_affected($q$
  update public.creator_applications set status = 'approved', decision_reason = 'Clear proposal' where id = 'c1000000-0000-0000-0000-000000000001'
$q$, 1, 'A-3 staff can review a creator application');
reset role;
select tests.assert((select reviewed_by from public.creator_applications where id = 'c1000000-0000-0000-0000-000000000001') = '22222222-2222-2222-2222-222222222222',
  'the reviewer is recorded by the database, not the client');
rollback;

-- Notifications ----------------------------------------------------------------------------
begin;
insert into public.notifications (profile_id, kind, title, link) values ('77777777-7777-7777-7777-777777777777', 'payment_receipt', 'Payment received', '/account/payment-history');
select tests.assert_rejected($q$
  insert into public.notifications (profile_id, kind, title, link) values ('77777777-7777-7777-7777-777777777777', 'x', 'Phish', 'https://evil.example')
$q$, 'notifications_link_relative', 'notification links stay on Sonara');
select tests.login('88888888-8888-8888-8888-888888888888');
select tests.assert_rows($q$ select 1 from public.notifications $q$, 0, 'notifications are private');
reset role;
select tests.login('77777777-7777-7777-7777-777777777777');
select tests.assert_affected($q$ update public.notifications set read_at = now() $q$, 1, 'a recipient can mark their notification read');
select tests.assert_denied($q$ update public.notifications set title = 'changed' $q$, 'a recipient cannot rewrite a notification');
rollback;
