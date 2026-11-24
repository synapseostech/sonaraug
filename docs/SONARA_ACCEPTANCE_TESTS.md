# Sonara — Acceptance Tests

**Updated:** 2026-11-23 · All results below were executed on 2026-11-23 on the development machine. Payments ran against the **local Flutterwave simulator**, not Flutterwave's sandbox.

> **Wave 2 update (2026-11-23):** the current baseline is **242 unit tests, 11 database suites and 27 browser
> journeys**. `SONARA_WAVE_2_ACCEPTANCE.md` is the authoritative Wave 2 report (security headers, migration dry
> run, Supabase adapter); the sections below remain the Wave 1 scenario-to-evidence map and are still accurate for
> the journeys they list.

## 1. How to run

```bash
pnpm typecheck                     # strict TS, all packages + web app
pnpm test                          # unit tests (node:test)
pnpm test:db                       # migrations + RLS suites on a throwaway Postgres 16 (:55432)

# Browser journeys against a production build (does not touch apps/web/.next or your dev data)
cd apps/web
export SONARA_DATA_DIR=/tmp/sonara-e2e-data && rm -rf "$SONARA_DATA_DIR"
NEXT_DIST_DIR=.next-build SONARA_ALLOW_DEV_BACKEND=1 npx next build
NODE_ENV=development pnpm sonara:dev seed-sample
NEXT_DIST_DIR=.next-build SONARA_ALLOW_DEV_BACKEND=1 SONARA_APP_URL=http://127.0.0.1:3110 \
  npx next start --port 3110 --hostname 127.0.0.1 &
cd ../.. && node scripts/sonara-e2e.mjs http://127.0.0.1:3110 "$SONARA_DATA_DIR"

# Responsive / accessibility evidence
ROUTES='["/medical-chronicles","/subscribe/listener","/auth/login"]' SKIP_JOURNEYS=1 \
  node scripts/browser-smoke.mjs http://127.0.0.1:3110 .tmp/smoke
```

## 2. Results summary (2026-11-23)

| Gate | Result |
|---|---|
| Typecheck (root + `@kito/ui` + `@kito/web`) | **Pass** |
| Unit tests | **196 / 196 pass** at Wave 1 (140 existing + 24 chronicles + 25 billing + 7 staff roles); **242 / 242** after Wave 2 |
| DB suites | **10 / 10 pass** at Wave 1 (7 existing + `08_billing`, `09_medical_chronicles`, `10_creators_roles`); **11 / 11** after Wave 2 (`11_wave2_backend`) |
| Production build (`NEXT_DIST_DIR=.next-build`) | **Pass**; client bundle scanned for secrets/server code: none |
| Browser journeys (`scripts/sonara-e2e.mjs`) | **26 / 26 pass** at Wave 1; **27 / 27** after Wave 2 (adds `SEC-HDR`), no uncaught page exceptions, no CSP violations |
| Responsive/a11y smoke (15 routes × 375/768/1440) | 0 horizontal overflow, 0 unnamed controls, 0 unlabelled fields, 0 console errors, 1 `h1` each; 5 sub-24 px targets remain on the **pre-existing** home page video cards |
| Lint | **Not run** — no ESLint configuration exists (`next lint` would start an installer); roadmap 0.2 |
| Flutterwave sandbox | **Not run** — no test keys |

## 3. Requested scenarios → evidence

Legend: **U** unit test · **D** DB/RLS test · **E** browser journey · **H** HTTP probe

### Listener
| # | Scenario | Evidence |
|---|---|---|
| 1 | A visitor can register | E L-1 |
| 2 | A visitor can verify their account | E L-2 (emailed link → confirm) |
| 3 | A listener can log in | E L-3 (wrong password rejected, then success) |
| 4 | First two episodes of a series are free | U, D, E L-4 (incl. media Range request) |
| 5 | Third episode locked without entitlement | U, D, E L-5 (UI paywall, API 403/401, URL manipulation 403) |
| 6 | Entitled listener accesses premium | U, D, E L-6 (audio element actually playing from `/api/media`) |
| 7 | Expired subscriptions stop granting access, subject to grace | U, D (grace yes; after grace no; cancelled → no grace) |
| 8 | Listener can view and cancel subscription | D, E L-8/P-7 (access continues to period end) |
| 9 | Listener cannot access another user's private data | D, E L-9 (export, admin denial) |

### Creator
| # | Scenario | Evidence |
|---|---|---|
| 1 | A user can apply to become a creator | D `10_creators_roles` (no UI yet — Wave 4) |
| 2 | Application requires review | D (cannot insert approved; cannot self-approve; reviewer recorded by DB) |
| 3 | Unpaid creator cannot use paid publishing | U (`no_plan`) |
| 4 | Paid creator gets plan privileges | U (limits returned; approval still required) |
| 5 | Creator cannot edit another creator's content | Existing D suite `02_tenant_isolation`; studio UI still demo (Wave 4) |
| 6 | Creator cannot self-approve restricted content | U, D, E C-6 (Medical Chronicles workflow) |

### Medical Chronicles
| # | Scenario | Evidence |
|---|---|---|
| 1 | Admin can create a series | E MC-1, D |
| 2 | Admin can add a NotebookLM link | U, E MC-2 (normalised, `authuser` stripped) |
| 3 | Invalid/unsupported links rejected | U (11 cases), D (lookalike host, http, `javascript:`), E MC-3 |
| 4 | Uploaded audio where storage exists | U (magic bytes), E L-4/L-6 (sample uploads stream with Range) |
| 5 | Mark episode free or premium | U, D |
| 6 | Episode order determines free allowance | U, D (season/number order; drafts/withdrawn take no position) |
| 7 | Withdrawn external source shows unavailable | D, E MC-7 |
| 8 | Editor can review and publish | U, D, E C-6 / MC-8 (different reviewer) |
| 9 | Unapproved episode not public | U, D, E MC-9a (404) |

### Payments
| # | Scenario | Evidence |
|---|---|---|
| 1 | Pending payment grants nothing | U, D |
| 2 | Verified success activates the correct entitlement | U, E P-2 |
| 3 | Failed payment grants nothing | U, E P-1/P-3/P-6 |
| 4 | Duplicate webhook creates no duplicate subscription | U, D, E P-4 (2 deliveries, 1 processed event, 1 subscription) |
| 5 | Forged webhook rejected | U, H (401), E P-5 |
| 6 | Amount/currency mismatches rejected | U, E (underpaid and wrong currency → no access, flagged) |
| 7 | Cancellation reflected | U, D, E L-8/P-7 |
| 8 | Reconciliation identifies inconsistencies | U, E P-8 |

### Admin
| # | Scenario | Evidence |
|---|---|---|
| 1 | Authorised admin can manage plans | D, E A-1 |
| 2 | Authorised admin can manage Medical Chronicles | D, E MC-1…MC-8 |
| 3 | Authorised admin can review creator applications | D (UI is demo until Wave 4) |
| 4 | Ordinary user cannot access admin routes | E A-4 (pages and upload API 403), H |
| 5 | Ordinary admin cannot escalate own privileges | U, D, E A-5 |
| 6 | Administrative changes generate audit events | D, E A-6 (incl. hash-chain verification) |

## 4. Not yet covered

Flutterwave sandbox; real email delivery; Supabase-backed runs; creator and broadcaster UI journeys (Wave 4); performance; screen-reader testing (automated checks only); ESLint; CI.

## 5. HTTP probes executed (production build)

Forged webhook → 401; webhook without hash → 401; playback POST cross-origin or without Origin → 403; media path traversal / unknown asset → 404; simulator without bearer key → 401; upload without session → 401, as a listener → 403; data export without session → 401; login `next=//evil.example` → not followed; callback with `status=successful` but no verifiable transaction → failure page ("pending"), never success; protected pages → 307 to sign-in; unknown episode → 404.
