-- =============================================================================
-- LOCAL TEST ONLY — mimics the pieces of Supabase that migrations depend on.
-- =============================================================================
-- This file is NEVER applied to a Supabase project. On Supabase, `auth.users`,
-- `auth.uid()` and the anon/authenticated/service_role roles already exist.
-- It exists so the same migrations can be exercised against a throwaway
-- PostgreSQL cluster in CI without Docker or network access.
-- =============================================================================

create schema if not exists auth;

create table if not exists auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text unique,
  phone              text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  raw_app_meta_data  jsonb not null default '{}'::jsonb,
  is_anonymous       boolean not null default false,
  email_confirmed_at timestamptz,
  banned_until       timestamptz,
  last_sign_in_at    timestamptz,
  created_at         timestamptz not null default now()
);

-- Supabase Auth sessions (subset of columns used by Sonara).
create table if not exists auth.sessions (
  id           uuid primary key,  -- no default, as in Supabase
  user_id      uuid not null references auth.users (id) on delete cascade,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  refreshed_at timestamp,
  not_after    timestamptz,
  user_agent   text,
  ip           inet
);

-- Supabase reads the JWT subject from the request settings.
-- Same resolution order as Supabase: legacy per-claim setting, then the claims JSON.
create or replace function auth.uid()
returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid;
$$;

create or replace function auth.role()
returns text language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon');
$$;

create or replace function auth.jwt()
returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
$$;

-- Supabase's API roles.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end $$;

grant usage on schema auth to anon, authenticated, service_role;
grant select on auth.users to service_role;
