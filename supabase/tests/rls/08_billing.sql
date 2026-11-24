-- =============================================================================
-- Subscriptions, payments and entitlements (migration 0120)
-- Every listener-side write path to money or access must be refused.
-- Users: 1111 admin, 7777 listener one, 8888 listener two.
-- =============================================================================

-- Shared setup (committed): one listener plan, one creator plan, one draft plan.
insert into public.subscription_plans (id, audience, code, name, interval, amount, currency, is_active) values
  ('e0000000-0000-0000-0000-000000000001', 'listener', 'test-listener', 'Listener (test)', 'monthly', 10000, 'UGX', true),
  ('e0000000-0000-0000-0000-000000000003', 'listener', 'test-hidden',   'Hidden draft plan', 'monthly', 5000, 'UGX', false);
insert into public.subscription_plans (id, audience, code, name, interval, amount, currency, is_active, creator_limits) values
  ('e0000000-0000-0000-0000-000000000002', 'creator', 'test-creator', 'Creator (test)', 'monthly', 30000, 'UGX', true,
   '{"maxShows":1,"maxEpisodes":10,"uploadAllowanceMb":500,"storageMb":2000,"canPublish":true}');

insert into public.payment_transactions (id, tx_ref, profile_id, plan_id, audience, amount, currency, status, environment, provider_transaction_id, verified_at)
values ('f0000000-0000-0000-0000-000000000001', 'SON-AAAAAAAAAAAAAAAA', '77777777-7777-7777-7777-777777777777',
        'e0000000-0000-0000-0000-000000000001', 'listener', 10000, 'UGX', 'successful', 'simulator', '1001', now());
insert into public.payment_transactions (id, tx_ref, profile_id, plan_id, audience, amount, currency, status, environment)
values ('f0000000-0000-0000-0000-000000000002', 'SON-BBBBBBBBBBBBBBBB', '88888888-8888-8888-8888-888888888888',
        'e0000000-0000-0000-0000-000000000001', 'listener', 10000, 'UGX', 'pending', 'simulator');
insert into public.subscriptions (id, profile_id, plan_id, audience, status, current_period_start, current_period_end)
values ('d0000000-0000-0000-0000-000000000001', '77777777-7777-7777-7777-777777777777', 'e0000000-0000-0000-0000-000000000001',
        'listener', 'active', now() - interval '5 days', now() + interval '25 days');
insert into public.subscription_payments (transaction_id, subscription_id, period_start, period_end)
values ('f0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', now() - interval '5 days', now() + interval '25 days');

-- Plans -----------------------------------------------------------------------
begin;
select tests.as_anon();
select tests.assert_rows($q$ select 1 from public.subscription_plans where code like 'test-%' $q$, 2, 'anon sees only active plans');
rollback;

begin;
select tests.login('77777777-7777-7777-7777-777777777777');
select tests.assert_denied($q$
  insert into public.subscription_plans (audience, code, name, interval, amount) values ('listener', 'mine', 'Mine', 'monthly', 1)
$q$, 'A-1 a listener cannot create a plan');
select tests.assert_affected($q$ update public.subscription_plans set amount = 1 where code = 'test-listener' $q$, 0, 'a listener cannot reprice a plan');
rollback;

begin;
select tests.login('11111111-1111-1111-1111-111111111111');
select tests.assert_affected($q$ update public.subscription_plans set amount = 12000 where code = 'test-listener' $q$, 1, 'A-1 an admin can manage plans');
select tests.assert_rows($q$ select 1 from public.audit_logs where entity_type = 'subscription_plans' and action = 'update' $q$, 1, 'A-6 a plan change is audited');
select tests.assert_rejected($q$
  insert into public.subscription_plans (audience, code, name, interval, amount, creator_limits) values ('listener', 'bad-mix', 'Bad', 'monthly', 100, '{}')
$q$, 'subscription_plans_limits_by_audience', 'a listener plan cannot carry creator limits');
select tests.assert_rejected($q$
  insert into public.subscription_plans (audience, code, name, interval, amount) values ('listener', 'zero', 'Zero', 'monthly', 0)
$q$, 'subscription_plans_amount_positive', 'a plan price must be positive');
rollback;

-- Subscriptions: listeners read their own and write nothing --------------------
begin;
select tests.login('88888888-8888-8888-8888-888888888888');
select tests.assert_rows($q$ select 1 from public.subscriptions $q$, 0, 'L-9 a listener cannot see another listener''s subscription');
select tests.assert_rows($q$ select 1 from public.payment_transactions $q$, 1, 'L-9 a listener sees only their own transactions');
select tests.assert_denied($q$
  insert into public.subscriptions (profile_id, plan_id, audience, status, current_period_start, current_period_end)
  values (auth.uid(), 'e0000000-0000-0000-0000-000000000001', 'listener', 'active', now(), now() + interval '30 days')
$q$, 'a listener cannot grant themselves a subscription');
select tests.assert_denied($q$
  update public.subscriptions set current_period_end = now() + interval '10 years' where id = 'd0000000-0000-0000-0000-000000000001'
$q$, 'a listener cannot extend someone else''s subscription');
rollback;

begin;
select tests.login('77777777-7777-7777-7777-777777777777');
select tests.assert_rows($q$ select 1 from public.subscriptions $q$, 1, 'a listener sees their own subscription');
select tests.assert_denied($q$
  update public.subscriptions set current_period_end = now() + interval '10 years' where id = 'd0000000-0000-0000-0000-000000000001'
$q$, 'a listener cannot extend their own subscription');
select public.cancel_my_subscription('d0000000-0000-0000-0000-000000000001');
reset role;
select tests.assert((select cancel_at_period_end from public.subscriptions where id = 'd0000000-0000-0000-0000-000000000001'), 'L-8 a listener can cancel their own subscription');
rollback;

begin;
select tests.login('88888888-8888-8888-8888-888888888888');
select tests.assert_rejected($q$ select public.cancel_my_subscription('d0000000-0000-0000-0000-000000000001') $q$,
  'no cancellable subscription', 'a listener cannot cancel someone else''s subscription');
rollback;

-- Payments: nobody marks money received from a client session ------------------
begin;
select tests.login('88888888-8888-8888-8888-888888888888');
select tests.assert_denied($q$
  update public.payment_transactions set status = 'successful', provider_transaction_id = '9', verified_at = now()
  where id = 'f0000000-0000-0000-0000-000000000002'
$q$, 'P-1 a listener cannot mark their pending payment successful');
select tests.assert_denied($q$
  insert into public.payment_transactions (tx_ref, profile_id, plan_id, audience, amount, currency, status, environment, provider_transaction_id, verified_at)
  values ('SON-CCCCCCCCCCCCCCCC', auth.uid(), 'e0000000-0000-0000-0000-000000000001', 'listener', 1, 'UGX', 'successful', 'live', '7', now())
$q$, 'a listener cannot insert a payment');
rollback;

begin;
select tests.login('11111111-1111-1111-1111-111111111111');
select tests.assert_rows($q$ select 1 from public.payment_transactions $q$, 2, 'finance/admin can read all transactions');
select tests.assert_denied($q$
  update public.payment_transactions set status = 'successful', provider_transaction_id = '9', verified_at = now()
  where id = 'f0000000-0000-0000-0000-000000000002'
$q$, 'an administrator cannot manually mark a transaction paid');
rollback;

begin;
-- Even the trusted processor must record the provider id and verification time.
select tests.assert_rejected($q$
  update public.payment_transactions set status = 'successful' where id = 'f0000000-0000-0000-0000-000000000002'
$q$, 'payment_transactions_success_is_verified', 'P-1 success requires a provider id and verification time');
select tests.assert_rejected($q$
  update public.payment_transactions set status = 'failed' where id = 'f0000000-0000-0000-0000-000000000001'
$q$, 'can only be reversed', 'a successful payment cannot be turned into a failure');
select tests.assert_rejected($q$
  update public.payment_transactions set amount = 1 where id = 'f0000000-0000-0000-0000-000000000002'
$q$, 'immutable', 'the expected amount is immutable');
select tests.assert_rejected($q$
  insert into public.payment_transactions (tx_ref, profile_id, plan_id, audience, amount, currency, environment)
  values ('SON-AAAAAAAAAAAAAAAA', '88888888-8888-8888-8888-888888888888', 'e0000000-0000-0000-0000-000000000001', 'listener', 10000, 'UGX', 'simulator')
$q$, 'payment_transactions_tx_ref_key', 'transaction references are unique');
rollback;

-- Idempotency -------------------------------------------------------------------
begin;
select tests.assert_rejected($q$
  insert into public.subscription_payments (transaction_id, subscription_id, period_start, period_end)
  values ('f0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', now(), now() + interval '30 days')
$q$, 'subscription_payments_pkey', 'P-4 one transaction cannot be credited twice');
insert into public.payment_webhook_events (idempotency_key, event_type, signature_valid, processing_status)
values ('charge.completed:1001:successful', 'charge.completed', true, 'processed');
select tests.assert_rejected($q$
  insert into public.payment_webhook_events (idempotency_key, event_type, signature_valid) values ('charge.completed:1001:successful', 'charge.completed', true)
$q$, 'payment_webhook_events_idempotency', 'P-4 a duplicate webhook delivery is detected by key');
select tests.assert_rejected($q$
  insert into public.payment_webhook_events (idempotency_key, event_type, signature_valid) values ('charge.completed:2:successful', 'charge.completed', false)
$q$, 'payment_webhook_events_key_only_when_signed', 'P-5 a forged delivery can never claim an idempotency key');
select tests.assert_rejected($q$
  insert into public.subscriptions (profile_id, plan_id, audience, status, current_period_start, current_period_end)
  values ('77777777-7777-7777-7777-777777777777', 'e0000000-0000-0000-0000-000000000001', 'listener', 'active', now(), now() + interval '30 days')
$q$, 'subscriptions_one_live_per_audience', 'P-4 at most one live subscription per person per product');
select tests.assert_rejected($q$
  insert into public.subscriptions (profile_id, plan_id, audience, status, current_period_start, current_period_end)
  values ('88888888-8888-8888-8888-888888888888', 'e0000000-0000-0000-0000-000000000002', 'listener', 'active', now(), now() + interval '30 days')
$q$, 'audience must match', 'a creator plan cannot back a listener subscription');
rollback;

begin;
select tests.login('11111111-1111-1111-1111-111111111111');
select tests.assert_rows($q$ select 1 from public.payment_webhook_events $q$, 0, 'webhook log readable by finance (empty here)');
rollback;
begin;
select tests.login('77777777-7777-7777-7777-777777777777');
select tests.assert_rows($q$ select 1 from public.payment_webhook_events $q$, 0, 'listeners cannot read webhook payloads');
rollback;

-- Overrides ----------------------------------------------------------------------
begin;
select tests.login('77777777-7777-7777-7777-777777777777');
select tests.assert_rejected($q$ select public.grant_entitlement_override(auth.uid(), 'listener', 'grant', 'I deserve it') $q$,
  'only finance', 'a listener cannot grant themselves premium access');
rollback;

begin;
select tests.login('11111111-1111-1111-1111-111111111111');
select tests.assert_rejected($q$ select public.grant_entitlement_override(auth.uid(), 'listener', 'grant', 'Testing my own access') $q$,
  'your own entitlements', 'an administrator cannot grant themselves access');
select tests.assert_rejected($q$ select public.grant_entitlement_override('88888888-8888-8888-8888-888888888888', 'listener', 'grant', 'x') $q$,
  'entitlement_overrides_reason_len', 'an override needs a real reason');
select public.grant_entitlement_override('88888888-8888-8888-8888-888888888888', 'listener', 'grant', 'Faculty partnership pilot');
-- Since 0160 clients cannot probe anyone's entitlement; check it as the owner.
select tests.assert_denied($q$ select app_private.has_active_entitlement('88888888-8888-8888-8888-888888888888', 'listener') $q$, 'clients cannot probe entitlements of arbitrary users');
select tests.assert_rows($q$ select 1 from public.audit_logs where action = 'entitlement.grant' $q$, 1, 'A-6 the override is audited with its reason');
reset role;
select tests.assert(app_private.has_active_entitlement('88888888-8888-8888-8888-888888888888', 'listener'), 'an audited grant gives listener access');
select tests.assert(not app_private.has_active_entitlement('88888888-8888-8888-8888-888888888888', 'creator'), 'a listener grant gives no creator access');
select tests.login('11111111-1111-1111-1111-111111111111');
select tests.assert_denied($q$
  insert into public.entitlement_overrides (profile_id, audience, effect, reason, created_by)
  values ('88888888-8888-8888-8888-888888888888', 'listener', 'grant', 'bypassing the RPC', auth.uid())
$q$, 'overrides can only be created through the audited RPC');
rollback;

-- Refunds ------------------------------------------------------------------------
begin;
select tests.login('77777777-7777-7777-7777-777777777777');
select tests.assert_affected($q$
  insert into public.refund_requests (transaction_id, requested_by, reason) values ('f0000000-0000-0000-0000-000000000001', auth.uid(), 'Charged twice by mistake')
$q$, 1, 'a payer can request a refund of their own successful payment');
select tests.assert_denied($q$
  insert into public.refund_requests (transaction_id, requested_by, reason) values ('f0000000-0000-0000-0000-000000000002', auth.uid(), 'Not my payment at all')
$q$, 'nobody can request a refund of someone else''s payment');
rollback;

-- Settings -----------------------------------------------------------------------
begin;
select tests.login('77777777-7777-7777-7777-777777777777');
select tests.assert_affected($q$ update public.platform_settings set value = '99' where key = 'chronicles.default_free_episode_allowance' $q$, 0, 'a listener cannot change platform settings');
rollback;
begin;
select tests.login('11111111-1111-1111-1111-111111111111');
select tests.assert_affected($q$ update public.platform_settings set value = '3' where key = 'chronicles.default_free_episode_allowance' $q$, 1, 'an admin can change platform settings');
rollback;
