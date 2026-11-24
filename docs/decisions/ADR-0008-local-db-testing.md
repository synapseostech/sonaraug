# ADR-0008 — Local RLS testing on a throwaway PostgreSQL cluster

**Date:** 2026-11-18 · **Status:** Accepted

## Context
RLS must be tested where it is enforced: in Postgres, as the `anon` and
`authenticated` roles. The Supabase CLI was not installed on the workstation, and
`supabase start` needs Docker images and ~1-2 GB of RAM that this machine does
not reliably have (11 GB total, swap under pressure).

## Decision
`supabase/tests/run-tests.sh` initialises a temporary PostgreSQL 16 cluster with
`initdb` (no sudo, no Docker), applies:
1. `tests/bootstrap/00_local_supabase_shim.sql` — `auth.users`, `auth.uid()`, and
   the `anon` / `authenticated` / `service_role` roles that Supabase provides;
2. every migration in order;
3. deterministic fixtures;
4. every file in `supabase/tests/rls/`.

The same script runs against a real Supabase database when `DATABASE_URL` is set,
so CI can exercise the hosted environment. pgTAP is not required — assertions are
plain SQL functions in the `tests` schema.

## Consequences
- The shim must be kept behaviourally faithful to Supabase (JWT claim handling).
  It is test-only and never applied to a project.
- The local Postgres version must track Supabase's (16 at time of writing).
- Tests run in seconds and require no network.
