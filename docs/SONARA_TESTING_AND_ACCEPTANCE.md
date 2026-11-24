# Sonara — Testing and Acceptance

> **Historical record (2026-11-22 audit).** For the current gate results see `SONARA_WAVE_2_ACCEPTANCE.md`
> (2026-11-23): 242 unit tests, 11 database suites, 27 browser journeys, 69 responsive/a11y combinations.

**Date:** 2026-11-22  ·  **Machine:** Linux, Node **26.13.1** (repo pins `>=22.11.0 <23`), pnpm 12.21.0, PostgreSQL 16 binaries, Google Chrome (headless).

---

## 1. Results recorded in this audit

| Check | Command | Result | Notes |
|---|---|---|---|
| Typecheck (strict) | `pnpm typecheck` | **Pass** (exit 0), before and after changes | Covers `packages/*` (except `ui` via its own run), `@kito/ui`, `@kito/web`. **Does not cover** `apps/mobile`, `apps/studio`, `apps/admin` or `workers/*` (empty). pnpm prints an unsupported-engine warning on Node 26. |
| Unit tests | `pnpm test` | **Pass: 138/138 at baseline → 140/140** after adding 2 SSRF tests | `node --test --experimental-strip-types packages/*/src/*.test.ts`, about 2 s. |
| Database / RLS tests | `pnpm test:db` | **Pass: 6/6 files at baseline → 7/7 files, 149 assertions** | Throwaway cluster on port 55432. The new `07_security_regressions.sql` was **confirmed to fail against the pre-fix schema** (first assertion, F-1). |
| Exploit probes | (session scratch scripts) | **Before:** 10 classes of exploit succeeded. **After:** all database-level exploits refused | Encoded permanently as `07_security_regressions.sql`. See SONARA_SECURITY_STATUS.md. |
| Lint | `pnpm lint` → `next lint` | **Not run: not configured** | No ESLint dependency or config exists. In Next 15.5, `next lint` without config starts an interactive setup that **installs packages and writes config**, so it was deliberately not run. |
| Production build | `NEXT_DIST_DIR=.next-build next build` (in `apps/web`) | **Pass** (3 builds) | 27 app routes (19 static, 8 dynamic); shared JS 102 kB; largest first load `/radio` 133 kB; about 48 s cold. Built into `.next-build` so the running `next dev` (which owns `.next`) was never disturbed. |
| Route smoke (dev server `:3100`) | `curl` over 30 routes | **29 × 200, 1 × 404 (`/nope`)** | `/radio/does-not-exist`, `/podcasts/nope` and `/watch/nope` return **200** with an in-page "not found" (soft 404). |
| Browser routes × viewports | `node scripts/browser-smoke.mjs` against `next start :3101` | **69 checks**: 0 overflow, 0 unnamed controls, 0 duplicate ids, 0 images without alt; **12** with unlabelled form fields; **33** with sub-24 px targets; **1** console error (a 404 for `/favicon.ico`) | Viewports 375×812 (touch), 768×1024 (touch), 1440×900. |
| Browser journeys | same harness | See §2 | |
| Responsive screenshots | same harness | Captured for home, radio, station detail, studio, admin, broadcast at 3 viewports | Written to `.tmp/browser-smoke/*.png` (gitignored). |
| Mobile app | — | **Not run** | Placeholder; dependencies not installed. |

### Development server handling

`next dev` was already running on `127.0.0.1:3100` (parent PID 30138) and was inspected, not restarted. Editing `next.config.mjs` (to add `distDir` support) caused `next dev` to restart its own server child automatically (PID 30151 → 39450); it kept serving 200 and picked up the copy fixes. Production builds were always written to `apps/web/.next-build`, and the temporary `next start` on `:3101` was stopped afterwards.

## 2. Browser journey results (production build)

| Journey | Observed | Verdict |
|---|---|---|
| Play a real station (Beat FM) | Button reads "Stream not available"; status "Not licensed to rebroadcast"; no audio | Correct; the rights gate holds (client-side only, F-12) |
| Play the first station on a station page (a related demo station) | "DEMO · On air · 0:02 listening"; `<audio>` has **no src** | Simulated; labelled DEMO, but "On air" overstates it |
| Play a podcast episode | Clock `0:03 / 49:48`; `<audio>` has **no src** | Simulated playback that saves fictional progress |
| Play a video | Video goes into the **audio** bar with a clock; **no `<video>` element** | Simulated |
| Favourite a station → Library | `kito.library.v1` written; station listed under favourites | Works locally |
| Search "capital" / gibberish | 4 results / a proper empty state | Works |
| Record 3 s in Studio (fake mic) | "Take ready to preview", `blob:` preview, download link | Works locally; lost on reload |
| Studio role switch | Options: creator, broadcaster, reviewer, admin | Simulated; self-approval possible |
| Keyboard: first Tab | Lands on "Skip to content" | Pass |
| Unknown station slug | "Station not found … Back to radio" with HTTP 200 | Soft 404 |
| Home timing (`next start`, local) | TTFB 4 ms, DCL 32 ms, load 83 ms, FCP 140 ms | Local only, not representative of 3G |

## 3. How to reproduce everything

```bash
cd "/home/ebrine/dev/SYNAPSE Player"
nvm use 22                                   # repo pin; Node 26 works but warns
pnpm install --frozen-lockfile               # only if node_modules are missing
pnpm typecheck
pnpm test
pnpm test:db                                 # needs /usr/lib/postgresql/16/bin

# Production build without touching a running `next dev`:
cd apps/web
NEXT_DIST_DIR=.next-build pnpm build
NEXT_DIST_DIR=.next-build pnpm exec next start --port 3101 --hostname 127.0.0.1 &
cd ../..
node scripts/browser-smoke.mjs http://127.0.0.1:3101 .tmp/browser-smoke
#   ROUTES='["/","/radio"]' SKIP_JOURNEYS=1 to narrow; CHROME=/path/to/chrome to override
```

Keep a DB cluster for manual probing: `KEEP_CLUSTER=1 pnpm test:db`, then
`PGHOST=/tmp/kito-pgtest-$(id -u) PGPORT=55432 psql -U postgres -d kito_test`.

## 4. Required regression tests (must stay green)

| Area | Test | Location |
|---|---|---|
| Security F-1 to F-8, F-11, F-13, F-14 | 64 assertions with positive controls | `supabase/tests/rls/07_security_regressions.sql` |
| Publish gate with trusted actors | Monitor and staff are explicit actors | `supabase/tests/rls/03_publish_gate.sql` |
| SSRF literals (F-9) | 23 hosts + 4 URLs blocked; public v4/v6 allowed | `packages/validation/src/security.test.ts` |
| Live radio semantics, resilience | 27 + 4 tests | `packages/media/src/*.test.ts` |
| Studio workflow permissions | 249-line suite | `packages/studio/src/workflow.test.ts` |

## 5. Gaps in the test system (prioritised)

1. **No CI.** Nothing runs automatically. Add a pipeline on Node 22: `install --frozen-lockfile` → `typecheck` → `test` → `test:db` → `build` → browser smoke.
2. **No lint.** Add `eslint@9` + `eslint-config-next` with a flat config as a deliberate change, plus a rule banning raw `fetch` in `workers/` (F-9).
3. **The browser harness is evidence, not a gate.** Convert it to Playwright with assertions once auth exists, or add thresholds now: 0 overflow, 0 unnamed controls, 0 unlabelled fields, 0 console errors.
4. **Uncovered apps.** Mobile, studio and admin aren't in `typecheck`.
5. **Missing catalog and bundle checks:**
   - no partition has `relrowsecurity = false` (F-8);
   - `app_private` is not an exposed schema (F-15);
   - no unlicensed stream URL appears in `.next*/static` (F-12).
6. **No contract tests yet** for edge functions or workers, because they don't exist. Each must ship with tests (SSRF via a stub resolver, RSS idempotency on 200 episodes, monitor never promotes an unreachable URL).
7. **Accessibility depth.** Add axe-core (or equivalent) contrast and ARIA checks, full keyboard traversal, and focus-visible snapshots.

## 6. Acceptance criteria by roadmap wave

Each wave is accepted only when its criteria pass **in CI**, not just on a developer machine.

### Wave 0 — Honest, safe baseline
- [ ] All results in §1 reproduced in CI on Node 22.
- [ ] Lint configured, with 0 errors.
- [ ] Unlicensed stream URLs absent from client bundles (bundle check passes).
- [ ] Unknown slugs return HTTP 404.
- [ ] 0 unlabelled form fields; favicon and manifest served.
- [ ] Simulated playback labelled at the point of play: no "On air" or ticking clock without audio.

### Wave 1 — Identity and tenancy on a real backend (local Supabase first)
- [ ] Email or phone OTP sign-in and sign-out; anonymous listening session; profile created on upgrade.
- [ ] `/studio` and `/admin` refuse unauthenticated and unauthorised users **server-side** (Playwright).
- [ ] Organisation creation → founder becomes owner; invite → email → token accept → correct role; ownership transfer RPC.
- [ ] All 7 DB suites plus new auth-flow tests pass against `supabase start` (not only the shim).

### Wave 2 — Real radio
- [ ] Stream monitor promotes only probed endpoints; SSRF `safeFetch` tests pass; partitions secured.
- [ ] At least one broadcaster with a **signed agreement** recorded and staff-verified; the station plays from DB data.
- [ ] Media Session controls; playback survives 3 forced network drops (PRD exit #7).
- [ ] Radio startup ≤ 3 s p50 on throttled 3G in the lab.

### Wave 3 — Studio persistence and media
- [ ] Upload → R2 presigned PUT under the owner prefix → verify → `ready`; signed playback URL; EXIF stripped.
- [ ] Episode audio actually plays; a 200-episode RSS import is idempotent (PRD exit #3).
- [ ] Review workflow enforced in the DB (decision D-4); reviewers cannot be creators of the same item.

### Wave 4 — Video, admin and moderation, mobile
- [ ] A 10-minute upload becomes HLS with captions in ≤ 5 minutes (PRD exit #4).
- [ ] Admin actions are RPCs that write `audit_logs`; reports are rate-limited.
- [ ] The mobile listener plays a verified station with lock-screen controls on Android 8+.
