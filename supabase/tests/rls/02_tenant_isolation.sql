-- =============================================================================
-- Organisation isolation: a broadcaster sees and writes only their own tenant.
-- =============================================================================
begin;
reset role;
select tests.login('44444444-4444-4444-4444-444444444444'); -- editor at org A

select tests.assert_rows($q$ select 1 from public.stations $q$, 2,
  'editor A sees both org A stations (published + draft)');
select tests.assert_rows($q$ select 1 from public.stations where slug = 'beta-fm' $q$, 0,
  'editor A cannot see another broadcaster''s station');
select tests.assert_rows($q$ select 1 from public.stations where slug = 'alpha-fm' $q$, 1,
  'editor A sees their own published station');

-- A cross-tenant UPDATE silently affects zero rows rather than erroring.
select tests.assert_affected($q$
  update public.stations set name = 'Hijacked' where slug = 'beta-fm' returning 1
$q$, 0, 'editor A cannot modify another tenant''s station');

select tests.assert_denied($q$
  insert into public.stations (org_id, slug, name, category_id, language_codes)
  values ('bbbbbbbb-0000-0000-0000-000000000002', 'rogue-station', 'Rogue', 'music', '{en}')
$q$, 'editor A cannot create a station inside another organisation');

-- An unaccepted invitation grants nothing.
select tests.assert_rows($q$ select 1 from public.organisations where slug = 'beta-broadcasting' $q$, 0,
  'an invited-but-not-accepted user sees no org detail beyond the public listing');

rollback;

begin;
reset role;
select tests.login('77777777-7777-7777-7777-777777777777'); -- invited to org B, never accepted
select tests.assert_rows($q$ select 1 from public.stations where slug = 'beta-fm' $q$, 0,
  'a pending invitation must not expose the tenant''s drafts');
rollback;

begin;
reset role;
select tests.login('33333333-3333-3333-3333-333333333333'); -- owner A

select tests.assert_rows($q$ select 1 from public.organisation_members $q$, 2,
  'owner A sees the two accepted members of their organisation');
select tests.assert_rows($q$ select 1 from public.rss_feeds $q$, 1,
  'owner A sees their podcast feed details');

-- Owner A must not see org B's members through the same endpoint.
select tests.assert_rows($q$
  select 1 from public.organisation_members where org_id = 'bbbbbbbb-0000-0000-0000-000000000002'
$q$, 0, 'owner A cannot read another organisation''s membership');

rollback;

begin;
reset role;
select tests.login('22222222-2222-2222-2222-222222222222'); -- moderator: staff, not tenant admin
select tests.assert_rows($q$ select 1 from public.stations $q$, 1,
  'a moderator sees published content only, not tenant drafts');
rollback;
