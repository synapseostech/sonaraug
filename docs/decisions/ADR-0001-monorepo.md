# ADR-0001 — Monorepo with Turborepo and pnpm workspaces

**Date:** 2026-11-18 · **Status:** Accepted

## Context
Four deliverables share a domain model: listener web, listener mobile, broadcaster
and creator self-service (studio), and internal administration. Mobile and web
must agree on playback semantics, statuses and validation. Separate repositories
would duplicate the contract and drift within weeks.

## Decision
One repository, pnpm workspaces, Turborepo task graph.

- `apps/mobile`, `apps/web`, `apps/studio`, `apps/admin`
- `packages/{config,types,validation,media,auth,analytics}` now; `ui` and `db` when first needed
- `supabase/`, `workers/`, `docs/`

## Consequences
- A schema change breaks `pnpm typecheck` across every consumer — intentional.
- CI can run only affected packages.
- Two deviations from the original proposal are documented rather than silent:
  `packages/ui` holds tokens (in `config`) plus primitives only once React Native
  is installed; rendering primitives cannot be shared between DOM and RN without
  adding a styling runtime we do not want in the MVP.
- `packages/db` is deliberately not created yet: an empty client-wrapper package
  is premature abstraction.

## Alternatives rejected
- **Polyrepo:** contract drift, four CI setups, four dependency trees.
- **Nx:** more powerful, heavier, and unfamiliar to the team.
- **Single Next.js app with route groups for studio/admin:** different auth
  surfaces, CSP and release cadence; a broadcaster-facing bug should not be able
  to take the listener site down.
