# Sonara — Implementation Roadmap (product expansion)

**Updated:** 2026-11-23 · Supersedes the wave plan in `SONARA_PRODUCT_ROADMAP.md` for sequencing; that document's decision register (D-1 … D-10) still applies.

## Wave 0 — Repository baseline ✅ (2026-11-23)

Recorded baseline before changes: typecheck pass; 140/140 unit tests; 7/7 DB suites; dev server not running; no git baseline (D-10 still open — the owner should make the initial commit).

Done in this wave: brand default → **Sonara** (user-facing only; `kito` identifiers unchanged); honest "Preview · no audio" label for demo podcasts/video (roadmap 0.5); undefined CSS variable in workspace labels fixed; favicon; 24 px target fixes on new surfaces; Flutterwave docs consulted; this roadmap.

Not done from the previous Wave 0 list (still open): CI (needs the initial commit), ESLint config (0.2), moving stream URLs server-side (0.3), CSP/HSTS (0.8), partition catalog checks (0.9).

## Wave 1 — Product foundation and Medical Chronicles ✅ (first vertical slice, 2026-11-23)

Delivered beyond the original Wave 1 scope, because the slice needed them end to end: server-side layer, accounts, entitlement engine, subscriptions, Flutterwave integration (simulator-tested), and the admin sections that control them.

| Area | Delivered |
|---|---|
| Medical Chronicles | 7 public routes; series/episodes/categories; NotebookLM links (provider registry), uploads, authorised URLs; free allowance; premium gating on server, API and media; editorial workflow, versions, corrections, withdrawal, medical-review record; disclaimers |
| Accounts | 7 auth routes, 13 account routes, dev auth adapter, dev outbox |
| Subscriptions | 8 routes, lifecycle, grace, cancellation, renewal, promos, overrides |
| Payments | Checkout, webhooks, verification, idempotency, reconciliation, refunds workflow, simulator |
| Admin | Overview, users, audit log, settings, MC (5 sections), plans & subscriptions, payments |
| Database | Migrations 0115–0140 + 3 adversarial suites |
| Tests | +56 unit tests, +3 DB suites, 26 browser journeys |

## Wave 2 — Real backend and security hardening ◑ implemented, not yet run against a hosted project (2026-11-23)

Code, migrations and tests are in place; the hosted half is blocked on D-2 (owner creates the dedicated project).
Nothing in this wave has been executed against a remote Supabase instance, Flutterwave's sandbox or a real SMTP
relay, and no production-readiness claim is made.

| Item | Status | Evidence / remaining work |
|---|---|---|
| Backend selection and adapter | ✅ | `lib/server/data.ts`, `store.ts` (dev), `sb/*` (Supabase); fail-closed config with 10 unit tests; the build itself fails without configuration |
| Auth via Supabase | ✅ code / ◑ unverified hosted | `@supabase/ssr`, `getUser()` per request, profile sync, no roles from metadata; journeys proven on the dev adapter only |
| RLS and migrations | ✅ local, ◑ remote | 22 migrations through 0180; 11 adversarial suites on throwaway Postgres 16 (and runnable against `supabase start` via `SONARA_TEST_TARGET=supabase-local`) |
| Data-service migration off the JSON store | ✅ | All services go through `readData`/`writeData`; the dev store stays the default in development |
| Email abstraction | ✅ code / ◑ unverified provider | SMTP/log/none, retries, delivery log, no token bodies; no real mail sent |
| Flutterwave sandbox readiness | ✅ code / ◑ unverified sandbox | Individual cancellation `PUT /v3/subscriptions/{id}/cancel` implemented; 12-item checklist in the integration doc, all **not run** |
| Security hardening | ✅ application layer | Nonce CSP + HSTS-on-HTTPS + COOP (9 unit tests, browser checks on 10 routes, production SEC-HDR journey); distributed rate limiter; privilege baseline 0170 (N-9); secrets list extended |
| Migration tooling | ✅ dry-run only | `scripts/sonara-migrate.mjs` (13 tests): deterministic ids, duplicate detection, ordering, simulator quarantine, reports; never connects to a database |
| Browser regression | ✅ | 27/27 journeys (26 baseline + SEC-HDR) against a production build |
| Hosted project, auth email SMTP, sandbox keys, media storage | ⛔ owner actions | D-2, provider decision, Flutterwave test keys, R2 decision (Wave 3) |

Remaining Wave 2 work after D-2: apply the migrations, run the 11 suites against the local Supabase stack and the
app against the hosted project, execute the auth journeys there, then the 12 sandbox payment checks. See
`SONARA_WAVE_2_ACCEPTANCE.md` for the exact sequence.

## Wave 3 — Media pipeline

R2 (or chosen provider) uploads with presigned PUT, server-side completion (magic bytes, size, checksum, AV scan), short-lived signed GET for premium audio, cover-image upload, transcoding to a standard bitrate, data-saver variant.

## Wave 4 — Creator subscriptions and workspace

`/creator` routes (apply, status, plans, checkout, dashboard, shows, episodes, media, recording, publishing, RSS, analytics, subscription, billing, settings, help) on the server; migrate Creator Studio off browser storage behind the existing `StudioRepository` seam; creator review queue in admin replacing the demo screen; plan limits enforced with `withinCreatorLimit`; broadcaster workspace separated from creator tools.

## Wave 5 — Admin completion

Broadcasters (verification, stream endpoints, rights, health — using the hardened 0110 schema and a real stream monitor), video, moderation and reports, monetisation foundations (advertisers, campaigns, sponsorships; no ad insertion into third-party streams without authorisation), analytics from real events only, scheduled jobs (billing, reconciliation, renewal reminders).

## Wave 6 — Production readiness

Security review and penetration test; RLS review on the live project; payment sandbox sign-off; browser tests in CI (the e2e script, plus Playwright when dependencies are approved); accessibility audit; performance budget on low-end Android; backups/PITR and restore drill; incident runbook; deploy-time guard that `SONARA_ALLOW_DEV_BACKEND` is absent; legal and tax review sign-offs; then — only with explicit owner approval and completed KYC — live payments.

## Decisions needed from the owner

| # | Decision | Blocks |
|---|---|---|
| D-2 | Create the dedicated Sonara Supabase project | Wave 2 |
| D-7 | Auth methods (email+password now; Google; phone OTP?) | Wave 2 |
| D-10 | Make the initial git commit | CI, safe iteration |
| New | Final plan prices, intervals, trials | Launch |
| New | Transactional email provider | Wave 2 |
| New | Flutterwave account + test keys; later live approval | Sandbox / live |
| New | Media storage provider (R2 per ADR-0004?) | Wave 3 |
| New | Tax and legal advisers (VAT, DPPA, consumer terms, refunds) | Launch |
