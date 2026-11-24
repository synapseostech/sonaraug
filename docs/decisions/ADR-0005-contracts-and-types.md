# ADR-0005 — Hand-written status unions now, generated DB types later

**Date:** 2026-11-18 · **Status:** Accepted

## Context
Generated database types are excellent for row shapes but poor as a design
contract: they describe what the database *is*, not what the product *allows*.
They also cannot catch the case where a policy change makes a status unreachable.

## Decision
`packages/types` hand-writes the unions that mirror PostgreSQL enums, plus the
listener-facing projections (`StationSummary`, `EpisodeSummary`, `VideoSummary`)
that the API actually returns. Generated types (`supabase gen types`) will be
added alongside as `database.types.ts` for table-level access, checked in and
regenerated in CI.

The duplication is deliberate: changing an enum in SQL without changing the
union fails `pnpm typecheck` in every app.

## Consequences
- Two files to update per enum change — one of which is generated.
- Projections keep RLS details out of the UI: a component cannot accidentally
  depend on a column the listener is not allowed to see.
