# ADR-0006 — Row Level Security is the security boundary

**Date:** 2026-11-18 · **Status:** Accepted

## Context
Supabase exposes PostgREST directly to clients. Any rule enforced only in
application code is advisory: a leaked anon key plus a crafted query is enough
to read another tenant's drafts.

## Decision
- RLS is enabled on every table. No `using (true)` on any tenant table.
- Policy logic lives in `app_private` helper functions (`SECURITY DEFINER`,
  `set search_path = ''`) so policies never recurse and cannot be manipulated.
- Privileges are a second layer: append-only tables (`audit_logs`,
  `moderation_actions`, `playback_events`, `impressions`, `clicks`) have
  INSERT/UPDATE/DELETE revoked where appropriate, and `profiles` grants UPDATE
  only on presentation columns.
- State changes that would make a row invisible to the author (comment deletion)
  or that must be audited (moderation) are RPCs, not client `UPDATE`s.
- Delivery data (`impressions`, `clicks`) is server-write-only. A client cannot
  fabricate an impression, which is what makes advertiser reporting defensible.
- Every policy has a test in `supabase/tests/rls/`.

## Consequences
- Policy changes require a migration plus a test, by convention and by review.
- Some operations need an RPC (comment delete, moderation). This is accepted:
  it also produces the audit trail regulators and advertisers expect.

## Known gaps
RLS tests exercise the six roles we ship. They do not prove the absence of a
policy bypass through a future SECURITY DEFINER function; every such function
must be reviewed and covered by a test.
