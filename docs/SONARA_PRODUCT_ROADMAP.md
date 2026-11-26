# Sonara — Product Roadmap

> **2026-11-23:** sequencing is superseded by [SONARA_IMPLEMENTATION_ROADMAP.md](SONARA_IMPLEMENTATION_ROADMAP.md) (product expansion: Medical Chronicles, accounts, subscriptions, Flutterwave, admin). The decision register below still applies.

**Date:** 2026-11-22  ·  **Basis:** SONARA_ENGINEERING_AUDIT.md, SONARA_FEATURE_STATUS.md, SONARA_SECURITY_STATUS.md
**Supersedes:** the roadmap section of `docs/PRODUCT_ENGINEERING_AUDIT.md`. `docs/product/backlog.md` remains the story-level backlog.

## Where we start

The product is a **high-quality, honest front end over static and local data**, plus a **real, now-hardened database design that nothing calls**:
- Listener UI, player architecture, studio and admin workflows, and the domain packages are well built.
- Auth, storage, workers, edge functions, the stream monitor and any server code are absent.
- No real audio or video plays: radio is blocked by rights, and podcasts and video are timers.

The roadmap therefore connects the two halves **in dependency order**, so that no feature is built twice: once on `localStorage`, then again on the backend.

## Dependency graph

```
                    ┌─────────────────────────────┐
                    │ W0  Baseline & guard rails  │  (no backend needed)
                    └──────────────┬──────────────┘
                                   │
                    ┌──────────────▼──────────────┐
  D-2 approve ────▶ │ W1  Identity & tenancy      │  local Supabase → dedicated project
  D-7 auth method   │     (auth, orgs, invites)   │
                    └───────┬──────────────┬──────┘
                            │              │
          ┌─────────────────▼───┐      ┌───▼──────────────────────┐
D-3 legal │ W2  Real radio      │      │ W3  Studio persistence   │ ◀── D-4 moderation
  ──────▶ │ monitor, rights,    │      │ & media pipeline (R2,    │     D-8 providers
          │ DB-backed directory │      │ signed URLs, RSS, audio) │
          └─────────┬───────────┘      └───┬──────────────────────┘
                    │                      │
                    └──────────┬───────────┘
                    ┌──────────▼──────────────────┐
                    │ W4  Video, admin/moderation │
                    │     on RPCs, listener       │
                    │     accounts & sync         │
                    └──────────┬──────────────────┘
                    ┌──────────▼──────────────────┐
                    │ W5  Mobile, notifications,  │
                    │     analytics, launch ops   │
                    └─────────────────────────────┘
```

W2 and W3 can run in parallel once W1 is done. W2 is **blocked on a legal deliverable** (a signed broadcaster agreement), not only engineering.

---

## Wave 0 — Baseline and guard rails (next wave; no backend, no cost)

**Goal:** a reproducible, CI-gated, honest baseline, so every later wave lands on solid ground.
**Depends on:** nothing. **Decisions needed:** D-1 (name), D-9 (Node), D-10 (initial commit).

| # | Item | Why now | Size |
|---|---|---|---|
| 0.1 | Make the initial git commit (by the owner) and add CI on Node 22: install → typecheck → test → test:db → build → smoke | Nothing is versioned; every claim in these docs is unprotected | S |
| 0.2 | ESLint 9 + `eslint-config-next` flat config; zero-error baseline | `pnpm lint` doesn't work today | S |
| 0.3 | Move `STREAM_REGISTRY` URLs and evidence for unlicensed stations out of client code into a server-only module, with a bundle check in CI | F-12: unlicensed URLs are public today | S |
| 0.4 | Server-render detail pages and call `notFound()` for unknown slugs (real 404) | Soft 404s; SEO; prepares for data fetching | M |
| 0.5 | Make simulated playback honest at the point of play: no "On air" or ticking clock for demo stations, podcasts or video; show "Preview — no audio in this build" | Biggest remaining misleading behaviour (F-12, product) | S |
| 0.6 | Label all studio fields (`htmlFor` / `useId` in `Field`); 24 px minimum targets for standalone links; favicon and manifest | Accessibility failures found in 12 + 33 checks | S |
| 0.7 | Turn `scripts/browser-smoke.mjs` thresholds into a failing gate (0 overflow, unnamed, unlabelled, console errors) | Prevents regressions until Playwright arrives in W1 | S |
| 0.8 | CSP (report-only first) and HSTS headers | F-15 | S |
| 0.9 | Catalog checks in `test:db`: no partition without RLS; audit triggers on `organisation_members`, `station_streams`, `media_assets`, `organisation_invitations` | F-8 residual; audit gaps | S |
| 0.10 | Apply D-1: set `NEXT_PUBLIC_BRAND_NAME` (and, if decided, rename the codename and package scope in one mechanical change) | Docs say Sonara, UI says Kito | S–M |

**Exit:** the Wave 0 criteria in SONARA_TESTING_AND_ACCEPTANCE.md §6.

## Wave 1 — Identity and tenancy (local Supabase first)

**Goal:** real users, organisations and roles enforced by the server, with no feature data migrated yet.
**Depends on:** W0. **Decisions:** D-2 (Supabase project, at the end of the wave), D-7 (auth method).

1. **Local first.** Use `supabase start` (Docker) with migrations 0001–0110, and run the DB suites against real Supabase Auth instead of the shim.
2. **Auth:** email OTP or magic link (and phone OTP if D-7 chooses it), anonymous listening sessions, a profile created when an anonymous user upgrades, and sign-out everywhere.
3. **Server boundary:**
   - `@supabase/ssr` session handling in Next middleware;
   - `/studio` and `/admin` gated server-side by `platform_roles` and org membership;
   - delete the "Simulated role" selector.
4. **Organisations:**
   - create an org, with the founder becoming owner (bootstrap path);
   - an invitation issuance RPC (server-generated token, hash stored, email sent);
   - accept via `accept_organisation_invitation`, plus a **confirmed-email** check;
   - a `transfer_organisation_ownership` RPC;
   - a members management UI.
5. **Database additions:** consent ledger (`consent_events`) and a consent UI; restrict `playback_events` inserts to public targets.
6. **Playwright:** sign-in, org creation, invitations, and access denial for anonymous and wrong-role users.
7. **Only then** provision the dedicated Sonara Supabase project (D-2), and apply migrations through the CLI from CI.

**Exit:** the Wave 1 criteria.

## Wave 2 — Real radio (parallel with W3)

**Goal:** real Ugandan stations playing from database data, with continuous verification and recorded rights.
**Depends on:** W1 (staff roles, org verification). **Blocked by:** D-3, review of reported broadcaster permissions and confirmation of music rights.

1. `safeFetch` (F-9): DNS resolution, `isReservedIpAddress` on every address, pinned connection, manual redirects, timeouts and byte caps.
2. The `stream-monitor` worker: DNS → connect → first bytes → content type → ICY → decode sample; writes `stream_health_checks`; moves status `registered → reachable → playable → degraded → failed`; calls `secure_partition` for each new monthly partition.
3. Staff verification flows (as RPCs, audited): organisation verification with a documents view, and rights-evidence verification. Expiry alerts at 30, 7 and 1 days.
4. Replace `lib/data/streams.ts` and the station parts of `catalogue.ts` with server reads of `stations` and `station_streams` (RLS serves only public, rights-cleared, playable data).
5. Broadcaster self-service: register a station, register endpoints, see probe results, submit rights evidence. This replaces the simulated studio broadcast pages.
6. Player: Media Session API (lock-screen and hardware keys), failover across DB-provided endpoints, data-saver bitrate preference.

**Exit:** the Wave 2 criteria, including PRD exit criteria #1 (partially, for web) and #7.

## Wave 3 — Studio persistence and the media pipeline (parallel with W2)

**Goal:** creators' work persists, uploads are real, and episodes produce audio.
**Depends on:** W1. **Decisions:** D-4 (pre- or post-moderation), D-8 (media providers: R2 plus Cloudflare Stream or Mux per ADR-0004).

1. Edge functions:
   - `upload-init`: a presigned R2 PUT under `org/<id>/` or `user/<id>/`, matching the 0110 guard;
   - `upload-complete`: size, magic bytes, AV scan, EXIF strip, checksum, then `ready`;
   - `media-token`: short-lived signed GET.
2. Replace the studio store's `localStorage` repository with Supabase tables behind the **same `StudioRepository` seam** (`lib/studio/store.tsx` was designed for this). Keep pure rules in `@kito/studio`.
3. The review workflow enforced in the database per D-4: `pending_review` → `published` only by moderators, and no self-approval.
4. Recording: upload takes directly (and resumably) from MediaRecorder; IndexedDB draft safety net.
5. Podcasts: real episode audio playback through signed URLs or a public CDN; hosted RSS feed per show (`buildRssPreview` → served feed); `rss-import` worker with idempotency (PRD #3).
6. Studio analytics only from real `playback_events` rollups. Remove the placeholder figures.

**Exit:** the Wave 3 criteria.

## Wave 4 — Video, admin and moderation, listener accounts

**Depends on:** W2 and W3.

1. Video: Cloudflare Stream or Mux upload, a `media-processing` webhook worker, HLS playback with a real `<video>` (hls.js where needed), captions (PRD #4).
2. Admin console on audited RPCs: report triage, comment moderation (the existing `moderate_comment`), station, organisation and creator verification queues, and an audit log viewer.
3. Listener accounts: server-side library (favourites, follows, saved items, progress, playlists) with a one-time import from `localStorage`; comments and reports with rate limiting and Turnstile (F-15).
4. Server-side search over the existing `tsvector` columns, plus `pg_trgm` for typos.

## Wave 5 — Mobile, notifications, analytics, launch readiness

**Depends on:** W4 (W5.1 can start after W2).

1. `apps/mobile`: Expo listener using `@kito/media` behaviour, `react-native-track-player` for background audio and lock-screen controls, Supabase auth, and the same RLS-backed reads.
2. Notifications worker (new episodes, station live alerts, quiet hours) and push tokens.
3. Analytics: consent-gated events via `@kito/analytics`, nightly rollups, partition retention.
4. Launch operations: backups and PITR with a tested restore, incident runbook, DSAR (access and erasure) flow, privacy notice, takedown SLA, Uganda regulatory review, advertising only behind `FF_ENABLE_ADVERTISING` with labelling (PRD #8).

---

## What we are deliberately not doing yet

- No Supabase provisioning, deployment, DNS or paid services until D-2 is approved (end of W1).
- No new listener features on top of `localStorage` (they would be rebuilt in W4).
- No advertising, monetisation or payouts work before W5.
- No markets beyond Uganda (the UI market switcher stays UG-only).

## Decision register (blocking items)

| ID | Decision | Blocks | Recommendation |
|---|---|---|---|
| D-1 | Product name "Sonara" vs the shipped "Kito"; rename the codename and `@kito/*` scope or only the display name | W0.10 | Display name now through env; rename the scope only if the brand is final |
| D-2 | Create the dedicated Sonara Supabase project: org, region, plan, budget owner | End of W1 | Approve after W1 passes locally. Separate from the healthcare project, as instructed |
| D-3 | Broadcaster retransmission permissions and music-rights coverage | W2 (legal) | Project owner reports written permissions for six stations; review the documents and clear underlying music rights before public playback |
| D-4 | Creator content pre-moderation vs post-moderation | W3 | Pre-moderate new creators; verified broadcasters publish directly |
| D-5 | Are verified organisations' contact email and phone public? | W1 | Public business email only; phone private |
| D-6 | Demo or fictional content in any externally visible build | Any deployment | Behind a "demo" flag, off by default outside local |
| D-7 | Auth method(s): email OTP, phone OTP (SMS cost and provider in Uganda), anonymous listening | W1 | Email OTP plus anonymous listening first; phone OTP once an SMS provider is chosen |
| D-8 | Media providers: R2 plus Cloudflare Stream vs Mux | W3/W4 | Follow ADR-0004 unless costs say otherwise |
| D-9 | Node version: install 22 locally or move `engines` forward | W0 | Install Node 22 to match the pin and CI |
| D-10 | Initial git commit and branch policy (not done by this audit, per instruction) | W0 | The owner commits the current tree as the baseline |
