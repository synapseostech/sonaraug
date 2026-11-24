-- =============================================================================
-- Advertisers see their own campaigns only; delivery data is server-written.
-- =============================================================================
begin;
reset role;
select tests.login('99999999-9999-9999-9999-999999999999'); -- advertiser org member

select tests.assert_rows($q$ select 1 from public.campaigns $q$, 1, 'advertiser sees their campaign');
select tests.assert_rows($q$ select 1 from public.impressions $q$, 1, 'advertiser sees their delivery data');

-- Impression integrity: clients can never fabricate delivery.
select tests.assert_denied($q$
  insert into public.impressions (campaign_id, advertisement_id, placement, dedupe_key)
  values ('a2000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001',
          'home_hero', 'forged-impression-000001')
$q$, 'clients cannot insert impressions');

select tests.assert_denied($q$
  insert into public.clicks (impression_id)
  values ('a4000000-0000-0000-0000-000000000001')
$q$, 'clients cannot insert clicks');

select tests.assert_denied($q$
  update public.impressions set billable = false
$q$, 'clients cannot alter delivery records');

select tests.assert_denied($q$
  insert into public.payouts (payee_kind, org_id, period_start, period_end, gross_ugx, net_ugx)
  values ('organisation', 'cccccccc-0000-0000-0000-000000000003', current_date - 30, current_date, 100000, 100000)
$q$, 'payouts are finance-only');

rollback;

begin;
reset role;
select tests.login('77777777-7777-7777-7777-777777777777'); -- ordinary listener

select tests.assert_rows($q$ select 1 from public.campaigns $q$, 0, 'listeners cannot see campaigns');
select tests.assert_rows($q$ select 1 from public.impressions $q$, 0, 'listeners cannot see delivery data');
select tests.assert_rows($q$ select 1 from public.placements $q$, 6, 'signed-in users can resolve placement labels');

rollback;

begin;
reset role;
select tests.as_anon();
select tests.assert_rows($q$ select 1 from public.placements $q$, 0, 'placements are not exposed anonymously');
rollback;
