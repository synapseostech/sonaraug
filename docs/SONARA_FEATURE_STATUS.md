# Sonara — Feature Status

> **Wave 2 update (2026-11-23):** the backend is no longer development-only by construction — a Supabase
> adapter, RLS migrations 0150–0180, fail-closed backend selection and security headers are implemented and tested.
> Nothing has run against a hosted project yet. See `SONARA_WAVE_2_ACCEPTANCE.md`.

**Date:** 2026-11-22  ·  **Build audited:** `apps/web` production build (`NEXT_DIST_DIR=.next-build`) and the running dev server on `:3100`, plus `supabase/` on a throwaway PostgreSQL 16.

## Classification key

| Label | Meaning |
|---|---|
| **Verified** | Implemented and verified by an executed test (unit, DB or browser journey) in this audit |
| **Implemented, not fully verified** | Real implementation; exercised only partially or by inspection |
| **Partial** | Some of the real behaviour exists; material parts missing |
| **Simulated** | The UI works, but the behaviour is a local or demo stand-in (`localStorage`, timers, invented numbers) |
| **Broken** | Exists but does not work as presented |
| **Not implemented** | Absent, or a placeholder screen only |

**Rule applied throughout:** a working screen is not a working feature. The web app has **no backend connection of any kind**: no Supabase client, no API routes, no server actions, and no `fetch` to any service. Every write in the product goes to the browser's `localStorage`. The database layer (`supabase/`) is real and tested, but **nothing calls it**.

---

## 1. Listener application (`apps/web`)

| Feature | Status | Evidence / notes |
|---|---|---|
| Home (hero, rails, featured content) | **Verified** (UI) | Renders at 375/768/1440 with no overflow. Hero copy corrected this audit (it showed "Verified live" for a station that can't play). |
| Navigation: sidebar, top search, mobile bottom nav | **Verified** | Skip link is the first tab stop; `aria-current` is set; no unnamed controls on 69 route × viewport checks. |
| Radio directory with filters (category, region, language, market) | **Verified** (UI) | Filters run over static data. Market switcher shows UG only. |
| Station detail page | **Verified** (UI) | Connection panel shows the stream evidence and rights state. Copy corrected this audit. |
| Podcast directory and show pages | **Simulated** | Sample catalogue (`lib/data/catalogue.ts`) with invented follower counts. |
| Watch (video) directory and video pages | **Simulated** | Sample catalogue; view counts are labelled "(demo)". |
| Search (all entity types, empty state) | **Verified** (UI) | Substring match over static arrays; the empty state works. No server search; the `tsvector` columns in the DB are unused. |
| My Library: favourites, follows, saved, watch later, history, continue listening | **Verified** (local only) | Persists in `localStorage["kito.library.v1"]`. No account, no sync. Lost if the browser is cleared. |
| Unknown slug → "not found" | **Partial** | Renders an in-page "Station not found", but returns **HTTP 200** (soft 404). Detail pages are client components. |
| Accounts, sign-in, sign-up, anonymous session | **Not implemented** | No auth UI or client. |
| Comments, reactions, reporting | **Not implemented** (listener side) | DB tables and RPCs exist; no listener UI. Studio has "local demo comments". |
| Notifications and push | **Not implemented** | |
| PWA (manifest, service worker, offline, install) | **Not implemented** | No `manifest.webmanifest` (404), no `favicon.ico` (404), no service worker. The README's "listener web + PWA" overstates this. |
| Consent and privacy settings | **Not implemented** | `@kito/analytics` has consent gating, but the web app doesn't import it. |
| Advertising surfaces | **Not implemented** | The schema exists (`0070`); `FF_ENABLE_ADVERTISING=false`. |

## 2. Radio playback and station rights

| Feature | Status | Evidence / notes |
|---|---|---|
| Real Ugandan station metadata (6 stations) | **Implemented, not fully verified** | Sourced from broadcasters' own sites and APIs and recorded with evidence in `lib/data/streams.ts`. Not re-checked in this audit (no outbound probing). |
| Stream endpoint evidence (DNS, HTTP, MIME, decode) | **Implemented, not fully verified** | A static evidence record dated 2026-11-22 for 5 stations (Record FM has no endpoint). It is a snapshot, not monitoring. |
| Rights gate (play only if `broadcaster_authorised`) | **Partial** | Works in the UI: **0 of 6** real stations are authorised, so **no real station plays in this build**. It is enforced **only in client code**, and the unlicensed URLs ship in the JS bundle (F-12). |
| HTMLAudioElement live player with retry, reconnect, failover, error classification | **Implemented, not fully verified** | Code exists (`lib/player.tsx`, `@kito/media`, 27 + 4 unit tests). It can't be exercised end to end because no station passes the rights gate. |
| Demo stations "playing" | **Simulated** | Pressing play on a fictional station shows "DEMO · On air · 0:02 listening" with **no audio source** (browser journey: `audioSrc=""`). It is labelled DEMO, but "On air" plus a listening timer overstates it. |
| Live stream health monitoring | **Not implemented** | `workers/stream-monitor/` is empty. |
| Lock-screen and hardware media keys (Media Session API) | **Not implemented** | No `navigator.mediaSession` usage. The PRD's MVP exit criterion #1 requires lock-screen controls. |
| Data-saver bitrate selection | **Not implemented** | The `DATA_SAVER_DEFAULT` env exists; nothing uses it. |

## 3. Podcasts and video

| Feature | Status | Evidence / notes |
|---|---|---|
| Episode playback | **Simulated** | Browser journey: the player clock advances (`0:03 / 49:48`) with an `<audio>` element that has **no `src`**. No audio is produced. The progress it saves to the library is fictional. |
| Video playback | **Simulated** | "Play video" puts the video into the **audio** player bar with a ticking clock. No `<video>` element, no HLS. |
| Speed control, ±15 s skip, queue, play next | **Implemented, not fully verified** | They operate on the simulated clock. |
| Resume / continue listening | **Simulated** | Persists the simulated position locally. |
| Downloads and offline | **Not implemented** | |
| RSS import | **Not implemented** | `workers/rss-import/` is empty; idempotency exists only in the schema (`unique (podcast_id, guid)`). |
| Hosted podcast audio, RSS feed hosting | **Not implemented** | |
| Video transcoding (Cloudflare Stream or Mux), captions | **Not implemented** | Schema only. |

## 4. Universal player and library

| Feature | Status | Evidence / notes |
|---|---|---|
| Persistent player bar, expanded player dialog | **Verified** (UI) | Mini and full player; the dialog has `aria-modal`. |
| Mixed live / episode / video model | **Implemented, not fully verified** | Live items correctly disable seek. A clean design. |
| Empty-player call to action | **Fixed this audit** | Offered "Start listening" for a station that can't play. Now shows "Browse stations" when nothing is playable. |
| Library sync across devices | **Not implemented** | `localStorage` only. |
| Playlists | **Not implemented** (UI) | DB tables exist. |

## 5. Creator Studio and recording (`/studio/*` inside `apps/web`)

| Feature | Status | Evidence / notes |
|---|---|---|
| Studio overview, shows, episodes, video drafts, media library, settings | **Simulated** | A full local workflow in `lib/studio/store.tsx`, persisted to `localStorage["kito.studio.v1"]` and seeded from `lib/studio/seed.ts`. Clearly labelled "Local workspace". |
| Draft → review → publish workflow, with permission rules | **Simulated** | The pure rules in `@kito/studio` are **Verified** (unit tests), but a user can switch role to "reviewer" and approve their own work. Nothing is published anywhere. |
| Browser recording (MediaRecorder) | **Verified** (local) | Journey: Record → 3 s → Stop → "Take ready to preview" with a `blob:` URL; download link works. Lost on reload. Never uploaded. |
| File selection and preview (audio, video, thumbnail) | **Implemented, not fully verified** | Object URLs only; "never uploaded" is stated in the UI. |
| Upload to storage | **Not implemented** | |
| RSS feed preview and warnings | **Implemented, not fully verified** | `buildRssPreview` is unit-tested; the UI says "no feed URL exists yet". |
| Studio analytics | **Simulated** | Figures derive from item-id length; labelled "demo" and "placeholder". |
| Form accessibility | **Partial** | 14 distinct studio fields have **no programmatic label** (84 `<Field>` uses, only 36 pass `htmlFor`). Affects `/studio/video/*`, `/studio/broadcast`, `/studio/live` and `/studio/settings`. |
| Greeting | **Minor bug** | "Good morning, Aisha" is hard-coded regardless of the time of day. |

## 6. Broadcaster Studio and live workflows

| Feature | Status | Evidence / notes |
|---|---|---|
| Station onboarding submission | **Simulated** | Local only. |
| Stream endpoint registration with SSRF validation | **Partial** | `streamEndpointCreateSchema` validation is **Verified**. Registration itself is local. |
| "Request check" stream test | **Simulated** | The UI states it "records a simulated platform-monitor result". |
| Programme schedule | **Simulated** | Local; the DB's no-overlap exclusion constraint is unused by the UI. |
| Live broadcast session (start/stop, listeners) | **Simulated** | `simulatedState`, `listenersDemo`; the RTMP ingest shown is `rtmp://ingest.example.ug/... (not configured)`. |
| Organisation membership and invitations | **Not implemented** (UI) | DB acceptance path **fixed and Verified** this audit (F-4/F-5); no UI, no email sending. |

## 7. Admin and moderation (`/admin/*`)

| Feature | Status | Evidence / notes |
|---|---|---|
| Operations overview, station submissions and detail, rights evidence, content review, creator applications, reports, history | **Simulated** | Decisions write to the same `localStorage` studio store. **No access control**: anyone can open `/admin`. |
| Moderation RPCs (`moderate_comment`, `delete_own_comment`) | **Verified** (DB) | `04_moderation_and_admin.sql`. Not called by the UI. |
| Organisation and creator verification, rights verification | **Verified** (DB, after fix) | Only platform staff can verify (F-1, F-3, F-14). No UI calls it. |
| Audit log | **Verified** (DB) | Append-only; admin-readable. Coverage gaps are listed in the security status. |

## 8. Mobile application (`apps/mobile`)

| Feature | Status | Evidence / notes |
|---|---|---|
| Expo / React Native app | **Not implemented** | A single placeholder screen: "Listener experience not implemented yet (Phase 3)". Dependencies are **not installed** in this checkout, and it is excluded from `pnpm typecheck`. Never built or run in this audit. |
| `apps/studio`, `apps/admin` (standalone Next apps) | **Not implemented** | Placeholder pages; the real studio and admin live inside `apps/web`. `apps/admin` has no `node_modules`. |

## 9. Database, auth and platform

| Feature | Status | Evidence / notes |
|---|---|---|
| Schema: 44 tables, enums, constraints, partitioning | **Verified** | 14 migrations apply cleanly to PostgreSQL 16. |
| RLS on all tables and partitions | **Verified (after fix)** | 7 suites, 149 assertions; partitions locked down in `0110`. |
| Station publish gate (verified org + monitor-verified stream + staff-verified rights in force) | **Verified (after fix)** | `03_publish_gate.sql`, `07_security_regressions.sql`. |
| Tenant isolation and membership integrity | **Verified (after fix)** | F-4/F-5 regression blocks. |
| Supabase Auth integration (sign-in, OTP, sessions) | **Not implemented** | `profiles` provisioning trigger is **Verified** against the local shim only. |
| Supabase project | **Not provisioned** | Deliberately; see the engineering audit, §7. |
| Edge functions (`supabase/functions`) | **Not implemented** | Empty directory. |
| Workers: stream-monitor, rss-import, media-processing, notifications, analytics | **Not implemented** | Empty directories; the README describes the contracts. |
| Media storage (R2) and signed URLs | **Not implemented** | |
| Env validation (`@kito/config/env`) | **Verified** (unit) | Not wired into a server, since none exists. |
| Analytics event catalogue and consent and PII guards | **Verified** (unit) | Not used by any app. |
| Permission matrix (`@kito/auth`) | **Verified** (unit) | Not used by any app. |

## 10. Cross-cutting quality

| Area | Status | Evidence |
|---|---|---|
| Responsive layout 375 / 768 / 1440 | **Verified** | 0 horizontal-overflow pages across 69 checks. |
| Keyboard entry (skip link) | **Verified** | First Tab lands on "Skip to content". Full keyboard traversal and focus visibility **not verified**. |
| Accessible names for controls | **Verified** | 0 unnamed buttons or links. |
| Form labels | **Partial** | 12 route × viewport combinations have unlabelled studio fields. |
| Target size ≥ 24 px (WCAG 2.2 AA 2.5.8) | **Partial** | 33 of 69 checks contain standalone text links about 17–19 px tall ("All stations", "See all episodes", list titles). The PRD targets 48 dp. |
| Colour contrast | **Implemented, not fully verified** | Token-level contrast is unit-tested (`contrast.test.ts`); not measured on rendered pages. |
| Loading, error and empty states | **Partial** | Search, library and not-found empty states exist. No loading states are needed today (static data), but none exist for when data becomes remote. |
| Performance | **Verified** (local) | Home on `next start`: TTFB 4 ms, FCP 140 ms, 16 KB transferred after cache; shared JS 102 kB, largest route 133 kB first load. Local numbers only, not field data. |
| Security headers | **Partial** | No CSP or HSTS (F-15). |
| Lint | **Not implemented** | No ESLint config or dependency. `next lint` would launch an interactive installer. |
| End-to-end test suite | **Partial** | A dependency-free browser smoke harness was added this audit (`scripts/browser-smoke.mjs`); it collects evidence and is not yet a gate. No Playwright. |
