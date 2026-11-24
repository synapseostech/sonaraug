-- =============================================================================
-- 0001 — Extensions, schemas, shared helpers
-- =============================================================================
-- Applied in order by `supabase db push` (or supabase/tests/run-tests.sh
-- locally). Every migration is additive and idempotent where practical so a
-- partial failure can be re-run without manual surgery.
-- =============================================================================

create extension if not exists pgcrypto;   -- gen_random_uuid, digest
create extension if not exists citext;     -- case-insensitive slugs/handles/emails
create extension if not exists btree_gist; -- needed for schedule overlap exclusion
create extension if not exists pg_trgm;    -- typo-tolerant search

-- Private schema: never exposed through PostgREST. Holds RLS helper functions
-- so that policy logic cannot be called directly by clients.
create schema if not exists app_private;

comment on schema app_private is
  'Internal helpers for RLS. Not exposed via the API. Do not grant USAGE to anon/authenticated.';

-- Time-of-day range used to prevent overlapping programme schedules.
do $$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where t.typname = 'timerange' and n.nspname = 'public') then
    create type public.timerange as range (subtype = time);
  end if;
end $$;

-- Generic updated_at maintenance.
create or replace function app_private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function app_private.set_updated_at() is
  'Trigger function: stamps updated_at on every UPDATE. Attached to all mutable tables in 0090.';
