-- =============================================================================
-- 0170 — Client-role privilege baseline (finding N-9)
-- =============================================================================
-- Found by running the RLS suites against a real (local) Supabase stack:
-- Supabase's default ACLs grant anon and authenticated EVERY privilege
-- (INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER) on every table the
-- migration role creates. Migrations 0001–0110 were written for stock
-- PostgreSQL, where new tables grant nothing, so on Supabase:
--   * anon could INSERT/UPDATE/DELETE on ~40 tables (RLS still refused rows);
--   * TRUNCATE — which RLS does NOT apply to — was granted to both client roles.
-- RLS kept the data safe, but the privilege layer meant to back it up did not
-- exist. This migration makes privileges explicit and platform-independent.
--
-- Reversal: none needed (it only removes privileges that were never intended).
-- To restore Supabase's defaults, re-grant ALL to anon/authenticated.
-- =============================================================================

-- 1. Never needed by clients, and TRUNCATE bypasses RLS entirely.
do $$
declare r record;
begin
  for r in
    select c.oid::regclass as rel from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('public', 'app_private') and c.relkind in ('r', 'p', 'v', 'm', 'f')
  loop
    execute format('revoke truncate, references, trigger on %s from anon, authenticated', r.rel);
  end loop;
end $$;

-- 2. Anonymous visitors read public data (RLS decides which rows) and may
--    write only two things: abuse reports and playback reliability telemetry.
do $$
declare r record;
begin
  for r in
    select c.oid::regclass as rel from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
  loop
    execute format('revoke insert, update, delete on %s from anon', r.rel);
  end loop;
end $$;
grant insert on public.content_reports to anon;
grant insert on public.playback_events to anon;

-- 3. Nothing in app_private is a table clients may touch directly.
do $$
declare r record;
begin
  for r in
    select c.oid::regclass as rel from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'app_private' and c.relkind in ('r', 'p')
  loop
    execute format('revoke all on %s from anon, authenticated', r.rel);
  end loop;
end $$;

-- 4. Future objects created by the migration role start with no client access:
--    every later migration must grant explicitly (and the catalog tests in
--    supabase/tests/rls/11_wave2_backend.sql fail if it forgets to revoke).
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from anon, authenticated, public;
alter default privileges in schema app_private revoke all on tables from anon, authenticated;
alter default privileges in schema app_private revoke execute on functions from anon, authenticated, public;
