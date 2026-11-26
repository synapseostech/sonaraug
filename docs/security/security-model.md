# Security and privacy model

## Threat model (ordered by realistic impact)

| # | Threat | Control |
|---|---|---|
| T1 | Cross-tenant data leak (broadcaster A reads B's drafts/revenue) | RLS with `app_private.has_org_role`; tested per role in `supabase/tests/rls/02` |
| T2 | Privilege escalation via `profiles` self-update | Column-level grants; `status`/role columns not granted; tested in `04` |
| T3 | Ad fraud / fabricated impressions | No client INSERT on `impressions`/`clicks`; server-side signing + `dedupe_key`; tested in `06` |
| T4 | SSRF via broadcaster-registered stream URL | `isPrivateOrReservedHost` rejects loopback, RFC1918, link-local, metadata, `.internal`/`.local`; tested in `validation/security.test.ts` |
| T5 | Service-role key leaking to a client | Key only in edge functions/workers; `SERVER_ONLY_KEYS` list; bundle grep in CI (to add) |
| T6 | Audience measurement deanonymisation | Analytics events carry no user id, no email/phone; guard functions throw on PII-shaped keys and values |
| T7 | Cache poisoning / XSS via comment or metadata | Input validated at the edge with zod; React escapes by default; CSP to be added with web Phase 3 |
| T8 | Copyright exposure from retransmission | Public playback requires per-station retransmission permission and music rights clearance |
| T9 | Abuse of anonymous sessions | Anonymous users can stream radio and file reports only; no writes to content |
| T10 | Malicious upload (audio/video) | Uploads are signed and scoped; status `quarantined` exists; provider transcodes out-of-band |

## What is implemented today

> **Correction (2026-11-22).** Before migration `0110`, two claims below were inaccurate: partitions were not
> RLS-protected, and the SSRF guard missed IPv4-mapped IPv6 and other literals. Tenants could also self-attest
> verification, stream health and rights. Current, evidence-based status: `docs/SONARA_SECURITY_STATUS.md`.

- RLS on every table, with 6 test suites covering six roles.
- Append-only enforcement on audit and moderation tables (grants + trigger).
- Audited moderation and comment deletion through `SECURITY DEFINER` RPCs.
- Publish gate: verified organisation + playable stream + rights in force.
- SSRF guard on every user-supplied URL that the server may fetch.
- Environment validation with explicit server-only key list.
- Consent gating and PII rejection in the analytics layer.

## What is designed but not implemented

- Rate limiting (edge function middleware + Postgres counters).
- CSP and security headers beyond the basics in `next.config.mjs`.
- Secret scanning and bundle inspection in CI.
- Backup/restore drills; PITR configuration.
- DSAR (access/erasure) workflow; retention jobs.
- Email/phone OTP flows and session revocation.
- File-type verification and malware scanning on upload.

## Compliance position — read this before claiming anything

Implementing technical controls does **not** constitute legal compliance. The
following require professional confirmation, and several require registration
before public launch:

| Obligation | Status | Owner action |
|---|---|---|
| Uganda Data Protection and Privacy Act 2019 — registration with the Personal Data Protection Office as a data collector/processor | **Not started** | Register; appoint a data protection contact |
| Lawful basis and privacy notice for listeners, creators, broadcasters | Draft wording not written | Legal review |
| Cross-border transfer basis (Supabase/Vercel/Cloudflare regions) | Unresolved | Decide region strategy; document transfer basis |
| UCC authorisation / licensing for content distribution | Unresolved | Confirm whether the platform needs a licence or operates under broadcaster authorisations |
| UPRS / music rights for retransmission | Unresolved; project owner reports broadcaster permission for six stations | Confirm music-work and sound-recording coverage with qualified counsel / relevant rights holders |
| Creator content licence terms (what we may host, monetise, sublicense) | Not drafted | Terms of service + creator agreement |
| Google Play / Apple App Store data-safety declarations | Not started | Complete at submission with real data flows |
| Children's data (under-18 listeners) | Not addressed | Age gating or policy decision |
| Advertising disclosure rules | Sponsored labels implemented | Confirm Uganda-specific requirements |

**Retention (proposed, needs legal confirmation):** playback telemetry 13 months
(aggregated thereafter); audit logs 24 months; account data until deletion + 30
days; support/report records 24 months; ad delivery records 24 months.

## Incident response (outline)

1. Triage and contain (revoke keys, disable endpoint, flip campaign/publish status).
2. Preserve `audit_logs`; do not mutate records under investigation.
3. Notify the owner immediately; assess whether the PDPO notification threshold is met.
4. Post-incident: ADR if an architectural change is required; add a regression test.
