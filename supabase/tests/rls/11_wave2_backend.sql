-- =============================================================================
-- Wave 2 backend support (migration 0160) and catalog-wide privilege checks.
-- Users: 1111 admin, 2222 moderator+medical_reviewer (09), 6666 content_editor (09),
-- 7777 subscriber (08), 8888 free listener. Episodes b1…1-4 published (09): 1-2 free, 3-4 premium.
-- =============================================================================

-- Catalog: RLS everywhere, no client writes where only the server may write -----
begin;
select tests.assert_rows($q$
  select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relispartition and not c.relrowsecurity
$q$, 0, 'F-8/0.9 every public table has row level security enabled');
select tests.assert_rows($q$
  select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relispartition
    and (has_table_privilege('anon', c.oid, 'SELECT') or has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE'))
$q$, 0, 'F-8 partitions grant nothing to client roles');
select tests.assert_rows($q$
  select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relispartition
    and has_table_privilege('anon', c.oid, 'INSERT,UPDATE,DELETE')
    and c.relname not in ('content_reports', 'playback_events')
$q$, 0, 'anonymous visitors can write only reports and playback telemetry');
select tests.assert_rows($q$
  select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public', 'app_private') and c.relkind in ('r', 'p')
    and (has_table_privilege('anon', c.oid, 'TRUNCATE,REFERENCES,TRIGGER') or has_table_privilege('authenticated', c.oid, 'TRUNCATE,REFERENCES,TRIGGER'))
$q$, 0, 'N-9 no client role can TRUNCATE (which bypasses RLS), reference or trigger any table');
create table public.zz_privilege_probe (id int);
select tests.assert(not has_table_privilege('anon', 'public.zz_privilege_probe', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
  and not has_table_privilege('authenticated', 'public.zz_privilege_probe', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE'),
  'N-9 a newly created table grants client roles nothing until a migration says so');
select tests.assert(not has_table_privilege('authenticated', 'public.' || t, 'INSERT,UPDATE,DELETE'), 'clients cannot write ' || t)
from unnest(array['payment_transactions', 'subscriptions', 'subscription_payments', 'payment_webhook_events',
                  'entitlement_overrides', 'audit_logs', 'platform_roles', 'email_deliveries']) as t;
select tests.assert(not has_table_privilege('authenticated', 'public.notifications', 'INSERT'), 'clients cannot create notifications');
select tests.assert(not has_column_privilege('authenticated', 'public.profiles', c, 'UPDATE'), 'clients cannot update profiles.' || c)
from unnest(array['status', 'deleted_at', 'terms_version', 'privacy_version', 'terms_accepted_at', 'deletion_requested_at', 'suspended_reason', 'is_anonymous']) as c;
select tests.assert(not has_function_privilege('authenticated', 'app_private.has_active_entitlement(uuid, public.plan_audience)', 'EXECUTE'), 'clients cannot probe entitlements');
select tests.assert(not has_function_privilege('authenticated', 'app_private.rate_limit_hit(text, integer, integer)', 'EXECUTE'), 'clients cannot touch rate limits');
rollback;

-- Staff permission matrix ---------------------------------------------------------
begin;
select tests.assert_rows($q$ select 1 from app_private.role_permissions where role = 'admin' $q$, 16, 'admin carries every permission');
select tests.assert_rows($q$ select 1 from app_private.role_permissions where role = 'content_editor' and permission = 'chronicles:review' $q$, 0, 'editors cannot review');
insert into public.platform_roles (profile_id, role) values ('33333333-3333-3333-3333-333333333333', 'finance');
select tests.login('33333333-3333-3333-3333-333333333333');
select tests.assert((select count(*) from public.audit_logs) > 0, 'finance can read the audit log (audit:read), as in the TS matrix');
reset role;
select tests.login('66666666-6666-6666-6666-666666666666');
select tests.assert_rows($q$ select 1 from public.audit_logs $q$, 0, 'a content editor cannot read the audit log');
rollback;

-- Profiles ---------------------------------------------------------------------------
begin;
select tests.login('88888888-8888-8888-8888-888888888888');
select tests.assert_affected($q$ update public.profiles set phone = '+256700000000', preferences = '{"playbackSpeed": 1.5}' where id = auth.uid() $q$, 1, 'a user can edit their phone and preferences');
select tests.assert_denied($q$ update public.profiles set status = 'active', suspended_reason = null where id = auth.uid() $q$, 'a user cannot lift their own suspension');
select tests.assert_denied($q$ update public.profiles set terms_version = 'made-up' where id = auth.uid() $q$, 'a user cannot write a terms version directly');
select tests.assert_rejected($q$ update public.profiles set phone = 'call me' where id = auth.uid() $q$, 'profiles_phone_format', 'phone numbers are validated');
select public.accept_current_terms(true);
reset role;
select tests.assert((select terms_version = '2026-11-draft' and marketing_consent from public.profiles where id = '88888888-8888-8888-8888-888888888888'),
  'terms acceptance records the platform version, not a caller-supplied one');
rollback;

begin;
insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaa0000-0000-0000-0000-00000000000a', 'meta@example.invalid', jsonb_build_object('display_name', repeat('x', 200), 'role', 'super_admin', 'roles', '["admin"]'));
select tests.assert((select char_length(display_name) = 80 from public.profiles where id = 'aaaa0000-0000-0000-0000-00000000000a'), 'over-long metadata names are truncated, not fatal');
select tests.assert_rows($q$ select 1 from public.platform_roles where profile_id = 'aaaa0000-0000-0000-0000-00000000000a' $q$, 0, 'signup metadata can never grant a role');
insert into auth.users (id, email, raw_user_meta_data) values ('aaaa0000-0000-0000-0000-00000000000b', 'ctl@example.invalid', '{"display_name": " \u0001\u0007 "}');
select tests.assert((select display_name = 'Listener' from public.profiles where id = 'aaaa0000-0000-0000-0000-00000000000b'), 'control-character names fall back safely');
rollback;

begin;
select tests.login('88888888-8888-8888-8888-888888888888');
select public.request_account_deletion();
reset role;
select tests.assert((select deletion_requested_at is not null from public.profiles where id = '88888888-8888-8888-8888-888888888888'), 'deletion requests are recorded');
select tests.assert_rows($q$ select 1 from public.audit_logs where action = 'account.deletion_requested' and entity_id = '88888888-8888-8888-8888-888888888888' $q$, 1, 'and audited');
rollback;

-- Listening history and saved episodes -----------------------------------------------
begin;
select tests.login('88888888-8888-8888-8888-888888888888');
select tests.assert_affected($q$
  insert into public.mc_listening_events (profile_id, episode_id, control) values (auth.uid(), 'b1000000-0000-0000-0000-000000000001', 'sonara')
$q$, 1, 'a listener records listening for a free episode');
select tests.assert_denied($q$
  insert into public.mc_listening_events (profile_id, episode_id, control) values (auth.uid(), 'b1000000-0000-0000-0000-000000000003', 'sonara')
$q$, 'a free listener cannot record listening for a premium episode');
select tests.assert_denied($q$
  insert into public.mc_listening_events (profile_id, episode_id, control) values ('77777777-7777-7777-7777-777777777777', 'b1000000-0000-0000-0000-000000000001', 'sonara')
$q$, 'nobody writes another listener''s history');
select tests.assert_affected($q$ insert into public.mc_saved_episodes (profile_id, episode_id) values (auth.uid(), 'b1000000-0000-0000-0000-000000000003') $q$, 1, 'a listener can save a published premium episode (to buy later)');
select tests.assert_denied($q$ insert into public.mc_saved_episodes (profile_id, episode_id) values (auth.uid(), 'b1000000-0000-0000-0000-000000000005') $q$, 'drafts cannot be saved');
reset role;
select tests.login('77777777-7777-7777-7777-777777777777');
select tests.assert_affected($q$
  insert into public.mc_listening_events (profile_id, episode_id, control) values (auth.uid(), 'b1000000-0000-0000-0000-000000000003', 'sonara')
$q$, 1, 'a subscriber records listening for a premium episode');
select tests.assert_rows($q$ select 1 from public.mc_listening_events where profile_id <> auth.uid() $q$, 0, 'listening history is private');
select tests.assert_rows($q$ select 1 from public.mc_saved_episodes $q$, 0, 'saved episodes are private');
rollback;

-- Email delivery log ------------------------------------------------------------------
begin;
select tests.assert_rejected($q$
  insert into public.email_deliveries (to_email, kind, subject, provider, body) values ('a@b.invalid', 'password_reset', 'Reset', 'smtp', 'https://x/reset?token=secret')
$q$, 'email_deliveries_no_auth_links', 'password-reset links are never stored');
insert into public.email_deliveries (to_email, kind, subject, provider, status) values ('a@b.invalid', 'payment_receipt', 'Receipt', 'smtp', 'sent');
select tests.login('88888888-8888-8888-8888-888888888888');
select tests.assert_rows($q$ select 1 from public.email_deliveries $q$, 0, 'listeners cannot read the email log');
select tests.assert_denied($q$ insert into public.email_deliveries (to_email, kind, subject, provider) values ('x@y.invalid', 'welcome', 'Hi', 'smtp') $q$, 'clients cannot queue email');
rollback;

-- Rate limiter ------------------------------------------------------------------------
begin;
select tests.assert(app_private.rate_limit_hit('k1', 2, 60), 'first hit allowed');
select tests.assert(app_private.rate_limit_hit('k1', 2, 60), 'second hit allowed');
select tests.assert(not app_private.rate_limit_hit('k1', 2, 60), 'third hit refused');
select tests.assert(app_private.rate_limit_hit('k2', 2, 60), 'keys are independent');
update app_private.rate_limits set window_start = now() - interval '2 minutes' where key = 'k1';
select tests.assert(app_private.rate_limit_hit('k1', 2, 60), 'the window resets');
rollback;

-- Audit chain ---------------------------------------------------------------------------
begin;
select tests.login('11111111-1111-1111-1111-111111111111');
select public.record_audit_event('settings.updated', 'platform_settings', null, '{"a":1}', '{"a":2}', 'Raise grace to 4 days', 'req-test-1');
select tests.assert((select ok from public.verify_audit_chain()), 'the audit chain verifies');
select tests.assert_rows($q$ select 1 from public.audit_logs where action = 'settings.updated' and actor_profile_id = auth.uid() and reason = 'Raise grace to 4 days' $q$, 1, 'staff events record actor and reason');
select tests.assert_denied($q$ update public.audit_logs set reason = 'rewritten' $q$, 'staff cannot rewrite the audit log');
reset role;
alter table public.audit_logs disable trigger audit_logs_append_only;
update public.audit_logs set reason = 'tampered' where id = (select min(id) from public.audit_logs where hash is not null);
alter table public.audit_logs enable trigger audit_logs_append_only;
select tests.login('11111111-1111-1111-1111-111111111111');
select tests.assert(not (select ok from public.verify_audit_chain()), 'tampering with a stored record is detected');
rollback;

begin;
select tests.login('88888888-8888-8888-8888-888888888888');
select tests.assert_rejected($q$ select public.record_audit_event('role.grant', 'user', null, null, null, 'forged', 'x') $q$, 'only staff', 'a listener cannot forge audit events');
select tests.assert_rejected($q$ select * from public.verify_audit_chain() $q$, 'audit access', 'a listener cannot run the verifier');
rollback;

-- Staff directory, own sessions, public source summary --------------------------------
begin;
select tests.login('11111111-1111-1111-1111-111111111111');
select tests.assert((select count(*) from public.admin_list_users() where email = 'listener1@example.invalid') = 1, 'admins see the user directory with emails');
reset role;
select tests.login('66666666-6666-6666-6666-666666666666');
select tests.assert_rejected($q$ select * from public.admin_list_users() $q$, 'users:read', 'an editor cannot list users');
reset role;
select tests.login('77777777-7777-7777-7777-777777777777');
select tests.assert_rejected($q$ select * from public.admin_list_users() $q$, 'users:read', 'a listener cannot list users');
rollback;

begin;
insert into auth.sessions (id, user_id, created_at, updated_at, user_agent) values ('5e551000-0000-0000-0000-000000000001', '77777777-7777-7777-7777-777777777777', now(), now(), 'Test agent');
select tests.login('77777777-7777-7777-7777-777777777777');
select tests.assert_rows($q$ select * from public.my_sessions() $q$, 1, 'a user sees their own sessions');
reset role;
select tests.login('88888888-8888-8888-8888-888888888888');
select tests.assert_rows($q$ select * from public.my_sessions() $q$, 0, 'and nobody else''s');
select tests.assert(not public.revoke_my_session('5e551000-0000-0000-0000-000000000001'), 'nobody can sign out another user''s device');
reset role;
select tests.login('77777777-7777-7777-7777-777777777777');
select tests.assert(public.revoke_my_session('5e551000-0000-0000-0000-000000000001'), 'a user can sign out their own device');
reset role;
select tests.assert_rows($q$ select 1 from auth.sessions where user_agent = 'Test agent' $q$, 0, 'and the session is gone');
rollback;

-- 0180: refund decisions, play counts, sample flags --------------------------------------
begin;
insert into public.refund_requests (id, transaction_id, requested_by, reason)
values ('e1000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', '77777777-7777-7777-7777-777777777777', 'Charged twice by mistake');
select tests.login('77777777-7777-7777-7777-777777777777');
select tests.assert_affected($q$ update public.refund_requests set status = 'approved', decided_by = auth.uid(), decided_at = now() where id = 'e1000000-0000-0000-0000-000000000001' $q$, 0, 'a payer cannot approve their own refund');
reset role;
select tests.login('11111111-1111-1111-1111-111111111111');
select tests.assert_affected($q$ update public.refund_requests set status = 'approved', decided_by = auth.uid(), decided_at = now(), decision_note = 'Duplicate charge confirmed' where id = 'e1000000-0000-0000-0000-000000000001' $q$, 1, 'finance can decide a refund');
select tests.assert_denied($q$ update public.refund_requests set status = 'refunded', decided_by = '22222222-2222-2222-2222-222222222222', decided_at = now() where id = 'e1000000-0000-0000-0000-000000000001' $q$, 'a decision is recorded under the decider''s own name');
rollback;

begin;
insert into public.mc_listening_events (profile_id, episode_id, control) values ('77777777-7777-7777-7777-777777777777', 'b1000000-0000-0000-0000-000000000005', 'sonara');
insert into public.mc_listening_events (profile_id, episode_id, control) values ('77777777-7777-7777-7777-777777777777', 'b1000000-0000-0000-0000-000000000001', 'sonara');
select tests.as_anon();
select tests.assert_rows($q$ select * from public.mc_play_counts() $q$, 1, 'play counts cover public episodes only (no draft activity leaks)');
rollback;

begin;
select tests.as_anon();
select tests.assert_rows($q$ select * from public.mc_public_source_info() $q$, 4, 'the public sees source kinds for published episodes only');
select tests.assert_rows($q$ select 1 from information_schema.routines r where r.routine_name = 'mc_public_source_info' $q$, 1, 'function exists');
rollback;
