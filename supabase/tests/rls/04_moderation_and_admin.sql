-- =============================================================================
-- Moderation and platform administration boundaries.
-- =============================================================================
begin;
reset role;
select tests.login('22222222-2222-2222-2222-222222222222'); -- moderator

select tests.assert_rows($q$ select 1 from public.content_reports $q$, 1,
  'moderators see the report queue');
select tests.assert_rows($q$ select 1 from public.comments $q$, 2,
  'moderators can see hidden comments');

-- Moderators hide content through an audited RPC, never a raw column write.
select tests.assert_affected($q$
  select public.moderate_comment('90000000-0000-0000-0000-000000000001', 'hide', 'copyright')
$q$, 1, 'moderators can hide a comment');

select tests.assert_rows($q$
  select 1 from public.comments
  where id = '90000000-0000-0000-0000-000000000001' and status = 'hidden'
$q$, 1, 'the comment is now hidden');

select tests.assert_rows($q$
  select 1 from public.moderation_actions
  where comment_id = '90000000-0000-0000-0000-000000000001' and action = 'hide'
$q$, 1, 'a moderation action was recorded');

select tests.assert_denied($q$
  update public.comments set status = 'visible'
  where id = '90000000-0000-0000-0000-000000000001'
$q$, 'even moderators cannot bypass the audited path');

-- The audit trail is append-only even for moderators.
select tests.assert_denied($q$
  insert into public.audit_logs (action, entity_type) values ('forged', 'stations')
$q$, 'moderators cannot write audit entries directly');
select tests.assert_denied($q$
  delete from public.audit_logs
$q$, 'audit entries cannot be deleted');
select tests.assert_denied($q$
  update public.audit_logs set action = 'tampered'
$q$, 'audit entries cannot be rewritten');

-- Moderators are not admins.
select tests.assert_rows($q$ select 1 from public.audit_logs $q$, 0,
  'audit logs are admin-only, not moderator-visible');

rollback;

begin;
reset role;
select tests.login('11111111-1111-1111-1111-111111111111'); -- admin

select tests.assert((select count(*) from public.audit_logs) > 0,
  'platform admins can read the audit trail');
select tests.assert_rows($q$ select 1 from public.platform_roles $q$, 2,
  'admins see all platform role grants');

rollback;

begin;
reset role;
select tests.login('77777777-7777-7777-7777-777777777777'); -- ordinary listener

select tests.assert_rows($q$ select 1 from public.content_reports $q$, 1,
  'a reporter can see the report they filed');
select tests.assert_rows($q$
  select 1 from public.content_reports where id = 'b1000000-0000-0000-0000-000000000001'
$q$, 1, 'the listener sees their own report');
select tests.assert_denied($q$
  select public.moderate_comment('90000000-0000-0000-0000-000000000001', 'hide', 'self-serve')
$q$, 'a listener cannot moderate content');

select tests.assert_denied($q$
  update public.comments set status = 'hidden'
  where id = '90000000-0000-0000-0000-000000000001'
$q$, 'a listener cannot move a comment into a moderation state');

select tests.assert_affected($q$
  update public.comments set body = 'Edited by author'
  where id = '90000000-0000-0000-0000-000000000001'
$q$, 1, 'a listener can edit their own comment text');

select tests.assert_denied($q$
  insert into public.platform_roles (profile_id, role)
  values ('77777777-7777-7777-7777-777777777777', 'admin')
$q$, 'a listener cannot grant themselves a platform role');

select tests.assert_affected($q$
  update public.profiles set display_name = 'Escalated'
  where id = '77777777-7777-7777-7777-777777777777'
$q$, 1, 'a listener can edit their own display name');

select tests.assert_denied($q$
  update public.profiles set status = 'suspended'
  where id = '77777777-7777-7777-7777-777777777777'
$q$, 'a listener cannot change their own account status');

-- Cross-profile writes are silently filtered by RLS: zero rows, no error.
select tests.assert_affected($q$
  update public.profiles set analytics_consent = true, display_name = 'Sneaky'
  where id = '88888888-8888-8888-8888-888888888888'
$q$, 0, 'a listener cannot change another profile''s consent or details');

rollback;
