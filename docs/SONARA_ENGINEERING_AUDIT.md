# Sonara — Engineering Audit

**Date:** 2026-11-22  ·  **Repository:** `/home/ebrine/dev/SYNAPSE Player`  ·  **Auditor role:** principal engineering, product architecture, security review and QA
**Companion documents:** [Feature status](SONARA_FEATURE_STATUS.md) · [Security status](SONARA_SECURITY_STATUS.md) · [Testing and acceptance](SONARA_TESTING_AND_ACCEPTANCE.md) · [Roadmap](SONARA_PRODUCT_ROADMAP.md)
**Supersedes:** `docs/PRODUCT_ENGINEERING_AUDIT.md` (the incomplete audit from the previous session, kept for history).

---

## 1. Executive summary

Sonara (shipped brand **"Kito"**) is a well-engineered **front-end prototype with a well-designed database that nothing uses yet**.

- **What is real:**
  - A responsive Next.js 15 listener app with a persistent universal player.
  - A creator studio and admin console that model the right workflows.
  - Strict TypeScript domain packages (playback state machine, resilience, validation, permissions, analytics consent), 140 passing unit tests.
  - A 44-table PostgreSQL schema with RLS and business-rule triggers, now 7 passing DB suites with 149 assertions.
- **What is not real:**
  - There is no authentication, no server code, no Supabase client, no storage, no worker and no edge function.
  - Every write goes to `localStorage`. Every studio and admin decision is simulated.
  - **No audio or video plays.** All six real Ugandan stations are correctly blocked by the rights gate, and podcast and video "playback" is a timer with no media source.
- **What was wrong and is now fixed:** the database security model, presented as the platform's security boundary, had **critical holes**:
  - An unverified broadcaster could publish an unprobed, unlicensed station with no staff involvement.
  - **Any signed-in user could take over any organisation.**
  - Listener consent choices, private media object keys and analytics partitions were publicly readable.

  All were reproduced as executed exploits. Migration `0110` fixes them, and 64 new regression assertions pin the fixes. Separately, the SSRF guard was bypassable through IPv4-mapped IPv6, and its literal parsing is now fixed.
- **Misleading copy, now fixed:** the home hero showed "Verified live" for a station that couldn't play, the station page said "verified Ugandan broadcaster", and the sidebar said "Live radio is real".
- **Next:** Wave 0 (CI, lint, an honest playback presentation, bundle hygiene, accessibility) needs no backend and no spending. Wave 1 (identity and tenancy on local Supabase) is the first backend step, and the dedicated Supabase project is provisioned only at the end of it, with your approval.

## 2. Scope and method

- **Source review** of every app, package, migration and test.
- **Executed validation:** typecheck, unit tests, DB and RLS tests, production build, 30-route HTTP smoke, and headless-Chrome checks over 23 routes × 3 viewports plus 10 interactive journeys. Details are in the testing document.
- **Exploit probes** run as the real `anon` and `authenticated` roles against a throwaway PostgreSQL 16 cluster: 57 executions of 51 distinct probes. Every database-level finding (F-1 to F-8, F-11, F-13, F-14) was demonstrated by at least one successful exploit before the fix and refused afterwards.
- **No external effects.** No Supabase project was created or connected (the healthcare project was not touched), nothing was deployed, no DNS was changed, and nothing was purchased. No git operations were performed, and the repository still has **no commits**.

## 3. Current repository state

| Item | State |
|---|---|
| Git | Initialised, **no commits**; every file untracked |
| Toolchain | pnpm 12.21 workspace + Turborepo; **Node 26.13.1 installed vs `engines` 22.x** (warning on every command) |
| Apps | `apps/web` (the whole product: listener + `/studio` + `/admin`), `apps/mobile` (placeholder, deps not installed), `apps/studio` and `apps/admin` (placeholder pages) |
| Packages | `config`, `types`, `validation`, `media`, `auth`, `analytics`, `studio`, `ui` (real, tested); `db` (empty) |
| Workers | 5 directories, **all empty**; the README describes their contracts |
| Supabase | 14 migrations (13 existing + `0110`), test harness, fixtures; `functions/` empty; **not provisioned** |
| Docs | PRD, backlog, architecture, security model, 9 ADRs, runbooks, plus these five Sonara documents |
| Dev server | `next dev` on `127.0.0.1:3100`, running throughout (see the testing document for PID notes) |

### Architecture as built

```
Browser ──▶ apps/web (Next 15, all client components for data pages)
              ├─ lib/data/catalogue.ts   static sample catalogue (+6 real station records)
              ├─ lib/data/streams.ts     static stream evidence + client-side rights gate
              ├─ lib/player.tsx          HTMLAudioElement live player / timer for VOD
              ├─ lib/library.tsx         localStorage "kito.library.v1"
              └─ lib/studio/store.tsx    localStorage "kito.studio.v1" (studio + admin)
            ─ ─ ─ ─ ─ ─ ─ ─ no connection ─ ─ ─ ─ ─ ─ ─ ─
supabase/migrations  (schema, RLS, triggers; exercised only by supabase/tests)
```

The `StudioRepository` seam in `lib/studio/store.tsx` and the shape of `streams.ts` were explicitly designed to be swapped for Supabase without changing component contracts. That is the main reason this codebase can move to a real backend without a rewrite.

## 4. Assessment by area

Status labels follow the feature-status document. Only the conclusions are summarised here.

| Area | Verdict | Key evidence |
|---|---|---|
| **Listener application** | Strong UI, static data | 0 overflow and 0 unnamed controls in 69 checks; soft 404s; no auth; no PWA despite the README claim |
| **Radio playback and rights** | Player implemented; **nothing plays**; rights gate client-side only | 0/6 stations authorised; unlicensed URLs in the bundle (F-12); no Media Session; no monitor |
| **Podcasts and video** | Simulated | Timer clock, `<audio>` with no `src`, no `<video>` element |
| **Universal player and library** | Good design, local only | Live vs on-demand semantics correct; queue and speed work on the simulated clock; library in `localStorage` |
| **Creator Studio and recording** | Simulated workflows; recording works locally | MediaRecorder journey passes; blobs are lost on reload; self-approval possible through the role switch |
| **Broadcaster Studio and live** | Simulated | Stream "check" and live session are labelled simulated; RTMP ingest is a placeholder |
| **Admin and moderation** | Simulated UI; real (and now fixed) DB RPCs and policies | `/admin` has no access control; decisions are `localStorage` writes |
| **Mobile** | Not implemented | One placeholder screen; dependencies not installed |
| **Database and migrations** | Well modelled; security model was broken and is now fixed | 14 migrations apply cleanly; 149 assertions; audit-trigger gaps remain |
| **Auth and org permissions** | DB model fixed; **no auth integration** | F-1, F-4, F-5 exploits closed; ownership transfer and invite issuance missing |
| **RLS and DB functions** | Fixed for all reproduced exploits | Partitions locked; trusted-writer model; `app_private` grant posture documented (F-15) |
| **Media storage and upload** | Not implemented; DB guards now correct | No R2, no signed URLs, no pipeline; prefix-scoped object keys enforced (F-13) |
| **Security headers and SSRF** | Basic headers only; SSRF literal checks fixed | No CSP or HSTS; DNS-resolution checks must live in the future `safeFetch` (F-9) |
| **Accessibility, responsiveness, performance** | Good foundations; specific failures | Skip link and names good; 14 unlabelled fields; sub-24 px links; FCP 140 ms locally |

## 5. Product experience review

### Misleading labels and status copy

- **Fixed in this audit:**
  - Home hero badge "Verified live" → "Awaiting authorisation" while no stream is rights-cleared.
  - Station header "verified Ugandan broadcaster" → "real Ugandan broadcaster". Platform verification doesn't exist yet.
  - Station connection panel "Press Listen live to connect" under "Not licensed" → an explanation of why playback is off.
  - Sidebar "Live radio is real…" → "Radio awaiting authorisation…".
  - Top pill "Live radio · demo catalogue" → "Demo build · radio not yet licensed".
  - Home section "Ugandan radio, verified" → "Real Ugandan radio" with an accurate subtitle.
  - Empty player "Start listening" for an unplayable station → "Browse stations".
  - Radio directory notice now states that playback is off for every real station.

  Every one of these is **conditional on real state** (`verifiedStations`, `featured.audioUrl`), so the copy becomes "Verified live" automatically once a station is authorised.
- **Still misleading (Wave 0.5):**
  - Demo stations show "On air · 0:02 listening" with no audio.
  - Podcast and video "playback" runs a clock and **saves fake listening progress** into the library.
  - Studio "Local media 3" counts assets whose blobs are already gone.

### Incomplete journeys

1. **Listen to real radio:** dead-ends at "Stream not available" for all real stations. This is legally correct, but it means the core proposition is not demonstrable.
2. **Listen to an episode or watch a video:** the UI behaves as if playing, but there is no media.
3. **Creator publish:** draft → submit → *switch your own role to Reviewer in the sidebar* → open the admin console → approve. That is four steps and a role change that no real user would make; it exists only because there is no second user.
4. **Broadcaster onboarding:** a submission and "request check" that don't reach anyone.
5. **Sign in, join an organisation, accept an invitation:** don't exist in the UI.

### Navigation and information architecture

- Studio and admin live inside `apps/web` and get their own shell, while `apps/studio` and `apps/admin` are dead placeholder apps. Decide whether to delete the placeholders or move the workspaces (roadmap W1).
- `/admin` is reachable from the studio sidebar ("Admin console →") by anyone. That is acceptable in a local demo, and must be server-gated in W1.

### Design consistency

- The listener and workspace shells are visually consistent (shared tokens from `@kito/config` through `@kito/ui`). The dark theme only. No inconsistencies severe enough to prioritise were observed.
- Workspace typography is denser and uses more uppercase micro-labels than the listener app. That is fine for a tool, but check it in a contrast audit.

### Accessibility

- **Good:** `lang`, skip link as the first tab stop, accessible names on all controls, `aria-current` on nav, a modal dialog for the expanded player, a single `h1` per page.
- **Failures:**
  - 14 studio form fields have no programmatic label: `Field` accepts `htmlFor`, but most call sites omit it.
  - Standalone text links are about 18 px tall (WCAG 2.2 AA 2.5.8 needs 24 px; the PRD wants 48 dp).
  - No favicon. Not verified: full keyboard traversal, focus visibility, rendered-page contrast, screen-reader output.

### Loading, error and empty states

Search, library, not-found and recorder-error states exist. Because all data is local and synchronous, there are **no loading or error states for remote data anywhere**. Every page will need them in W1–W3. Plan this as part of the server-data refactor, not as an afterthought.

## 6. Most important weaknesses (ranked)

1. **The database security boundary was not a boundary.** It is fixed now, but the existing tests had *encoded* the vulnerabilities as intended behaviour. Every future RLS change needs adversarial tests: "a tenant tries to set X".
2. **Nothing connects the UI to the backend.** Every feature is either static or `localStorage`, so the product can't demonstrate any multi-user value.
3. **No real media plays.** Radio is blocked by rights (correctly), and on-demand is simulated. The core value proposition is currently undemonstrable.
4. **Rights are a legal dependency on the critical path.** Engineering can't unblock radio without a signed broadcaster agreement (D-3).
5. **No CI, no commits, no lint.** Quality currently depends on someone running commands by hand.
6. **Workers and edge functions are empty**, and they hold the platform's trust decisions: stream verification, media readiness, signed URLs.
7. **Mobile is a placeholder**, while the PRD's MVP exit criteria are mobile-first (lock-screen controls on Android 8+).

## 7. Backend requirements (for the dedicated Sonara Supabase project, not provisioned)

### 7.1 Database changes beyond `0110`

| Change | Purpose |
|---|---|
| `transfer_organisation_ownership(new_owner uuid)` RPC | Ownership transfer is impossible for tenants after F-5 |
| `issue_organisation_invitation(org, email, role)` RPC | Server-generated token; store the SHA-256 only; return the raw token to the mailer only |
| Confirmed-email check in `accept_organisation_invitation` | Prevents redemption by an unconfirmed address |
| `consent_events` append-only table + `set_consent(...)` RPC | DPPA consent ledger (F-6 residual) |
| Profile creation on anonymous → registered upgrade | `handle_new_user` only fires on insert |
| Review transitions for channels, videos, podcasts, episodes (moderator-only `published`) | Decision D-4 (F-14) |
| Restrict `playback_events` inserts to public targets | F-15 |
| Audit triggers on `organisation_members`, `station_streams`, `media_assets`, `organisation_invitations` | Trust-relevant tables are currently unaudited |
| Generated TypeScript types into `packages/db` | Typed client; `packages/db` is empty today |

### 7.2 Authentication flows

1. **Anonymous listening:** Supabase anonymous sign-in; no profile row (as designed); telemetry with `profile_id null`.
2. **Registration and sign-in:** email OTP or magic link first (D-7); phone OTP when an SMS provider is chosen; a profile is created by trigger or on upgrade.
3. **Sessions:** `@supabase/ssr` cookies; middleware refresh; server-side gate for `/studio` (any accepted membership or creator) and `/admin` (`platform_roles`).
4. **Organisation onboarding:** create an org (unverified) → founder becomes owner → submit `verification_requests` with documents → staff verify → `verified`.
5. **Invitations:** an owner or admin issues an invite → email with the raw token → the invitee signs in with the same, confirmed email → `accept_organisation_invitation`.
6. **Staff roles:** `platform_roles` written only by `service_role` (an operator CLI or an audited RPC); `super_admin` bootstrap documented in a runbook.
7. **Session security:** revoke on password or email change; a "sign out everywhere" option; short JWT expiry.

### 7.3 Edge functions

| Function | Responsibility |
|---|---|
| `upload-init` | Presigned R2 PUT under `org/<id>/` or `user/<id>/` (matches the 0110 guard); creates the `pending_upload` row |
| `upload-complete` | Verify size and magic bytes, AV scan, strip EXIF, compute SHA-256 → `ready` / `quarantined`; set `is_public` for artwork |
| `media-token` | Short-lived signed GET for private media; checks RLS visibility first |
| `telemetry` | Rate-limited ingestion of playback events (replaces direct anonymous inserts) |
| `report` | Content reports with Turnstile and rate limiting |
| `invite-mail` | Sends invitation emails |

### 7.4 Workers

`stream-monitor` (uses `safeFetch` and `secure_partition`), `rss-import` (uses `safeFetch`; idempotent upsert), `media-processing` (provider webhooks with signature verification), `notifications`, and `analytics` (rollups and partition retention). The contracts are in `workers/README.md`.

### 7.5 Integrations (all already templated in `.env.example`)

Supabase (Auth, Postgres, Edge Functions); Cloudflare R2 and Stream (or Mux, D-8); an email provider; an SMS provider for phone OTP (D-7); Sentry; PostHog (EU host, consent-gated); Cloudflare Turnstile. **No keys exist in the repository**, which was checked: `.env.example` has empty values only.

## 8. Changes made in this audit

All changes are scoped: they make the baseline accurate or close a demonstrated vulnerability. No feature work was started.

| File | Change | Reason |
|---|---|---|
| `supabase/migrations/0110_security_hardening.sql` | **New.** Trusted-writer model and fixes for F-1 to F-8, F-11, F-13 and F-14 | Critical exploits reproduced |
| `supabase/tests/rls/07_security_regressions.sql` | **New.** 64 assertions | Pin the fixes; confirmed to fail before them |
| `supabase/tests/rls/03_publish_gate.sql` | Updated: the monitor and staff are explicit actors | The old test encoded F-2/F-3 as correct |
| `supabase/tests/fixtures/00_seed.sql` | Artwork flagged `is_public` | Required by the F-7 fix |
| `packages/validation/src/common.ts` | Proper IPv4/IPv6 parsing; RFC 6890 ranges; `isReservedIpAddress` | F-9 bypasses |
| `packages/validation/src/security.test.ts` | +2 tests (27 blocked forms, public v4/v6 allowed) | F-9 regression |
| `apps/web/app/page.tsx`, `app/radio/page.tsx`, `app/radio/[slug]/page.tsx`, `components/nav.tsx`, `components/player-bar.tsx` | State-conditional status copy | Misleading "verified" and "live" claims |
| `apps/web/next.config.mjs` | `distDir` from `NEXT_DIST_DIR` (default `.next`) | Lets a production build run beside `next dev` without sharing `.next` |
| `apps/web/tsconfig.json` | Next added `.next-build/types/**/*.ts` to `include` on first build | Generated by Next; harmless |
| `.gitignore` | `.next-*/` | Ignore isolated build output |
| `scripts/browser-smoke.mjs` | **New.** Dependency-free headless-Chrome smoke, responsive and a11y evidence harness | Reproducible browser checks |
| `docs/SONARA_*.md` (5) | **New** | The deliverables |

## 9. Remaining blockers and decisions

See the decision register in the [roadmap](SONARA_PRODUCT_ROADMAP.md#decision-register-blocking-items) (D-1 to D-10). The items that need **your approval** before any work that costs money or touches external systems:
- **D-2:** create the dedicated Sonara Supabase project.
- **D-3:** broadcaster agreements (legal).
- **D-7:** an SMS provider, if phone OTP is chosen.
- **D-8:** media providers.
- **D-10:** the initial commit.
