# ADR-0007 — Workers are cron-invoked handlers, not long-running servers

**Date:** 2026-11-18 · **Status:** Accepted

## Context
The proposed `workers/` tree (rss-import, stream-monitor, media-processing,
notifications, analytics) implies always-on processes. Five Node servers is a
standing bill, a patching burden and a monitoring surface disproportionate to an
MVP with one engineer.

## Decision
Each worker is a pure handler function invoked on a schedule:
- stream monitoring and RSS polling → Cloudflare Cron Triggers (global, cheap,
  no server);
- provider webhooks (Stream, Mux) → Supabase Edge Function;
- retention jobs and rollups → `pg_cron` inside Postgres.

Handlers take `(env, now)` and return a summary, so they are testable without a
scheduler and can be moved to a container later without a rewrite.

## Consequences
- No always-on cost; failure is a missed invocation, surfaced by a heartbeat row.
- Execution time limits apply (Workers 30s CPU / Edge Functions ~150s). Stream
  probing and feed parsing fit comfortably; long transcodes never run here — the
  provider does that.
- A stuck worker is detected by comparing `last_success_at` against a threshold,
  not by process supervision.
