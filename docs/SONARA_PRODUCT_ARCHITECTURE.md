# Sonara — Product Architecture

**Updated:** 2026-11-23 (Wave 0 baseline + Wave 1 slice) · **Brand:** Sonara (internal codename `kito`, package scope `@kito/*` unchanged — renaming needs an approved migration plan, decision D-1).

This document describes how the product is put together *today*, what is real, what is simulated, and what the production target is. Companion documents:
[Medical Chronicles](SONARA_MEDICAL_CHRONICLES.md) · [Subscriptions](SONARA_SUBSCRIPTIONS.md) · [Flutterwave](SONARA_FLUTTERWAVE_INTEGRATION.md) · [Admin](SONARA_ADMIN_PLATFORM.md) · [Accounts](SONARA_ACCOUNT_AND_AUTH.md) · [Security](SONARA_SECURITY_STATUS.md) · [Roadmap](SONARA_IMPLEMENTATION_ROADMAP.md) · [Acceptance tests](SONARA_ACCEPTANCE_TESTS.md)

---

## 1. Experiences and route map

| Experience | Routes | Shell | Backend status |
|---|---|---|---|
| Listener platform | `/`, `/radio`, `/podcasts`, `/watch`, `/search`, `/library` | Listener shell + persistent player | Static catalogue + browser storage (unchanged, pre-existing) |
| **Medical Chronicles** | `/medical-chronicles`, `/categories`, `/category/[slug]`, `/series/[slug]`, `/[episodeSlug]`, `/search`, `/subscribe` | Listener shell + MC sub-brand band | **Server-side** (this wave) |
| Accounts | `/auth/*`, `/account/*` (13 pages) | Listener shell | **Server-side** (this wave) |
| Subscriptions | `/subscribe`, `/subscribe/{listener,checkout,success,failed,manage,cancel,renewal}` | Listener shell | **Server-side**, payments via simulator or Flutterwave |
| Creator Studio / Broadcaster | `/studio/*` | Workspace shell | Browser-storage demo (unchanged); server migration is Wave 4 |
| Admin console | `/admin` + Platform, Medical Chronicles, Commerce sections | Workspace shell | **Server-side** for the new sections; "Review (demo data)" sections still browser storage |
| Legal (drafts) | `/legal/terms`, `/legal/privacy` | Listener shell | Draft text pending legal review |
| Development tools | `/dev/outbox`, `/dev/flutterwave-sim/pay` | Bare | 404 outside development |

Public navigation: Home · Radio · Podcasts · Medical Chronicles · Watch · Library · Subscribe · Search · Sign in / Account (Admin console link for staff). Mobile bottom bar: Home, Radio, Podcasts, Chronicles, Watch, Library.

## 2. Code layout

```
packages/
  chronicles/   NEW  audio-source registry, free-allowance access rule, editorial workflow, slugs (24 tests)
  billing/      NEW  money, plans, promos, subscription lifecycle, entitlement engine,
                     transaction verification, reconciliation (index — browser-safe)
                     + Flutterwave client & webhook verification (./flutterwave — server only) (25 tests)
  auth/         + staff.ts: platform staff permissions and role-grant rules (7 tests)
  types/        PlatformRole + content_editor, medical_reviewer
  config/       brand default name → "Sonara"; FLW secrets added to SERVER_ONLY_KEYS
apps/web/
  lib/server/   NEW  server-only service layer (never imported by client components)
    store.ts          local development JSON store (see §3)
    auth.ts           sessions, passwords, verification/reset tokens, requireStaff
    chronicles.ts     MC queries, editorial commands, playback resolution
    billing.ts        checkout, verification, webhooks, lifecycle, refunds, overrides, reconciliation
    entitlements.ts   wires @kito/billing + @kito/chronicles to stored records
    users.ts          account self-service and staff user administration
    media.ts          local-disk media storage (development)
    notify.ts         in-app notifications + email provider abstraction (dev outbox)
    audit.ts          hash-chained append-only audit log
    payments-config.ts, flutterwave-sim.ts, request.ts, http.ts, actions-util.ts
  app/api/      route handlers: playback, progress, save, media streaming, upload,
                Flutterwave webhook + callback, account export, simulator (dev)
  components/sonara/      UI kit (page header, panels, tables, forms, plans, subscriptions)
  components/chronicles/  MC band, episode rows, player panel
supabase/migrations/
  0115  platform roles content_editor, medical_reviewer
  0120  settings, plans, promos, subscriptions, transactions, webhook log, refunds, overrides
  0130  Medical Chronicles (categories, series, episodes, sources, versions, events, corrections)
  0140  creator applications, notifications, audited role-grant RPCs
  0150–0180  Wave 2: enum additions, backend-support tables/RPCs, privilege baseline, app-support functions
supabase/tests/rls/08_billing.sql … 11_wave2_backend.sql
apps/web/lib/server/{data,store}.ts   storage boundary + development store
apps/web/lib/server/sb/*              Supabase adapter (Postgres via pg, RLS as the caller)
apps/web/middleware.ts                per-request nonce CSP + HSTS-on-HTTPS
scripts/sonara-e2e.mjs        browser acceptance journeys (27 checks)
scripts/sonara-migrate.mjs    development-store migration planner (dry run only)
apps/web/scripts/sonara-dev.ts local admin bootstrap, sample content, audit verification
```

## 3. Persistence: two halves, one model

There is still **no Sonara Supabase project** (decision D-2). This wave therefore builds the model twice, deliberately in the same shape:

1. **PostgreSQL schema with RLS** (`0115`–`0140`), tested adversarially on a throwaway local Postgres (`pnpm test:db`). This is the production design: listeners cannot write payment or subscription state at all; premium audio sources are reachable only through `mc_episode_playback()`, which applies the free-allowance rule inside the database; self-approval is blocked by trigger.
2. **A local development store** (`apps/web/lib/server/store.ts`): one JSON file on the server's disk, atomic writes, single-writer mutex. It lets every server-side rule run end to end in the browser today. **It is not production persistence**: single process, no backups, refuses to start in production unless `SONARA_ALLOW_DEV_BACKEND=1` is set for a local smoke test.

Callers use the service functions in `lib/server/*`, not the store directly.

**Wave 2 completes the second implementation.** `lib/server/data.ts` is now the boundary: services declare the
rows they need (`readData(scope)`) and mutate a snapshot (`writeData(scope, mutate)`). In development the scope is
ignored and the JSON store is used; with `SONARA_BACKEND=supabase` the same call runs inside a transaction that
sets `role authenticated`/`anon` plus the verified JWT claims, loads only the declared rows, and persists the diff
— so RLS decides what a person can see, not the page. `withService(reason)` (service_role) is limited to the
payment processor, notifications, email logs, audit of self-service actions, media registration and display-only
lookups. Production without Supabase configuration throws instead of falling back, and the development store
refuses to start in production; both are unit-tested. No page imports `fs` or `pg`.

The dev store remains in place until the Supabase path passes the acceptance run; see
`SONARA_BACKEND_MIGRATION.md` for the entity mapping and `SONARA_SUPABASE_SETUP.md` for the owner's steps.

## 4. Where decisions are made

| Decision | Where | Never |
|---|---|---|
| Can this person hear this episode? | `@kito/chronicles` `decideEpisodeAccess` on the server; `mc_episode_playback()` in SQL | In the browser |
| Is this person premium / may they publish? | `@kito/billing` entitlement engine on the server; `has_active_entitlement()` in SQL | From a redirect or cookie claim |
| Did a payment succeed? | Server re-query `GET /v3/transactions/{id}/verify` + `evaluateVerification` | From the webhook body or the `status` query parameter |
| May this staff member do X? | `@kito/auth` `staffCan` against roles **re-read from the store on every request** | From roles cached in a session |
| Can an episode go live? | `@kito/chronicles` `transition` (no self-approval, current-version approval) + DB trigger | From the editor who wrote it |

## 5. Player

`lib/player.tsx` now has three paths:
- **Live radio** (unchanged): real `<audio>` for verified, rights-cleared stations; reconnect with backoff.
- **Real on-demand** (new): Medical Chronicles audio authorised by the server — true position via `timeupdate`, seek, speed, resume, ended → next, server listening-history checkpoints every 15 s.
- **Preview** (pre-existing demo podcasts/video): a timer with **no audio**, now labelled "Preview · no audio in this build" in the player bar (closes roadmap item 0.5 for on-demand).

NotebookLM episodes never enter the player: they are provider-controlled and open on NotebookLM in a new tab with an explicit "Sonara cannot track this playback" notice.

## 6. What is real, simulated or missing

| Area | Real (server-enforced, tested) | Simulated / development-only | Needs external setup |
|---|---|---|---|
| Accounts | Registration, verification, login, lockout, reset, sessions, devices, export, deletion request; Supabase Auth adapter implemented | Email delivery (dev outbox; SMTP adapter unexercised) | Supabase project (D-2); transactional email provider |
| Medical Chronicles | Series/episodes/categories CRUD, editorial workflow, versions, corrections, withdrawal, free allowance, premium gating, NotebookLM links, uploads, streaming with Range | Media storage on local disk | Cloudflare R2 (or equivalent) + signed URLs |
| Payments | Checkout creation, verification, webhooks, idempotency, mismatch handling, cancellation, refunds workflow, reconciliation | Local Flutterwave simulator | Flutterwave account, test keys, webhook hash, sandbox run; live only after KYC + approval |
| Admin | Users, roles, suspension, plans, promos, overrides, payments, webhooks, audit, settings, MC management | Podcast/video review, stations, reports, rights, creator readiness (browser storage) | Wave 4/5 for those sections |
| Creator / broadcaster | Entitlement rules (paid plan **and** approval), DB tables for applications | Studio and broadcaster workspaces (browser storage) | Wave 4 |
| Advertising, analytics | — | — | Later waves |
