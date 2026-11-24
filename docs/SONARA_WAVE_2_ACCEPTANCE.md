# Sonara — Wave 2 Acceptance Report

**Date:** 2026-11-23 · **Scope:** Supabase backend migration, authentication adapter, RLS, security hardening,
migration tooling and email boundary. **Not a production-readiness claim.**

> **The short version.** Everything that can be proved without a hosted Supabase project, Flutterwave test keys or
> an SMTP relay has been proved. The parts that need those three things have **not run**, and this document keeps
> them in a separate column rather than blending them in.

---

## 1. Test categories (do not read one as another)

| Category | What it means here | Where it ran | Result |
|---|---|---|---|
| **Unit (mock/no I/O)** | Pure functions: backend selection, CSP policy, rate-limit accounting, email config, migration planner, billing, chronicles, editorial workflow | Node 22 test runner, no network, no database | 242 / 242 pass |
| **Database (local PostgreSQL 16)** | Real migrations + RLS policies + SECURITY DEFINER functions on a throwaway cluster; adversaries act as `anon`, `authenticated` and staff roles | `supabase/tests/run-tests.sh` (port 55432, socket under `/tmp`) | 11 / 11 suites pass |
| **Database (local Supabase stack)** | The same suites against `supabase start` (PostgREST/GoTrue present, no compatibility shim) | **Not run in this session** — the harness supports it (`SONARA_TEST_TARGET=supabase-local`, localhost only) | — |
| **Browser (local, production build)** | Real Chrome over CDP against `next start`, dev backend permitted for a localhost smoke run | `scripts/sonara-e2e.mjs` → 27 / 27 checks; `scripts/browser-smoke.mjs` → 69 route/viewport combinations | pass (see §4, §5) |
| **HTTP (headers)** | CSP/HSTS/COOP on a real response, plus zero CSP violations in the browser console | dev server (`:3100`) and production build (`:3110`) | pass |
| **Flutterwave simulator** | Fake provider with documented request/response shapes and signed webhooks; no money | e2e P-2, P-4, P-1/P-3/P-6, P-5/P-8, L-8 | pass |
| **Flutterwave sandbox** | The real provider with test keys | **Not run** — no keys (owner action) | not started |
| **Remote Supabase** | The hosted Sonara project | **Not run** — project not provisioned (D-2) | not started |
| **SMTP delivery** | A real relay sending real mail | **Not run** — no provider credentials | not started |

---

## 2. Gates

| Gate | Command | Result |
|---|---|---|
| Typecheck | `pnpm typecheck` | **Pass** (root + `@kito/ui` + `@kito/web`) |
| Unit tests | `pnpm test` | **242 / 242 pass** (196 Wave 1 baseline + 46 new) |
| Database suites | `pnpm test:db` | **11 / 11 pass** (10 baseline + `11_wave2_backend`) |
| Production build | `SONARA_BACKEND=dev SONARA_ALLOW_DEV_BACKEND=1 NEXT_DIST_DIR=.next-build npx next build` | **Pass** |
| Fail-closed build | `NEXT_DIST_DIR=.next-build npx next build` with no backend config | **Fails, as intended** — `BackendConfigError` names all four missing Supabase values instead of building a dev-backed artifact |
| Browser journeys | `node scripts/sonara-e2e.mjs http://127.0.0.1:3110 /tmp/sonara-e2e-data` | **27 / 27 pass**, no uncaught exceptions, no CSP violations |
| Responsive / accessibility smoke | `node scripts/browser-smoke.mjs http://127.0.0.1:3110 .tmp/smoke` | **69 route/viewport combinations, 0 problems** (detail in §5) |
| Migration dry run on real dev data | `node scripts/sonara-migrate.mjs --data-dir /tmp/sonara-e2e-data --out .tmp/sonara-migration` | **135 records planned, 0 blocking errors**, 4 sample episodes + 4 fixture accounts excluded |
| Lint | `pnpm lint` | **Not run** — no ESLint configuration exists (roadmap 0.2); `next lint` would start an installer |
| Local Supabase stack | `SONARA_TEST_TARGET=supabase-local … pnpm test:db` | **Not run** — no Docker/Supabase CLI run approved in this session |
| Remote Supabase | — | **Not run** — D-2 |
| Flutterwave sandbox | 12-item checklist | **Not run** — no test keys |
| Real email | — | **Not run** — no provider credentials |

---

## 3. What Wave 2 added, and the tests that prove it

### Unit tests (+46)

| File | Tests | Proves |
|---|---|---|
| `apps/web/lib/security-headers.test.ts` | 9 | nonce + `strict-dynamic` in production, no `unsafe-inline`/`unsafe-eval` for scripts, `object-src`/`frame-ancestors`/`frame-src` none, https-only media allow-list, HSTS only on HTTPS (no `preload`), `upgrade-insecure-requests` only on production HTTPS, no duplicate headers, origin normalisation drops `http`/`javascript:`/junk, proxy-aware HTTPS detection |
| `apps/web/lib/server/backend-config.test.ts` | 10 | dev default; production without Supabase refuses; `SONARA_BACKEND=dev` refused in production unless the smoke flag is exactly `1`; unknown backend refused; complete config resolves with TLS required; localhost DB refused in production; publishable key can never be the secret; plain http only for localhost; all problems reported together; non-postgres URL refused |
| `apps/web/lib/server/email-config.test.ts` | 7 | provider inference and validation; sender validation; TLS defaults (required for remote, optional only for localhost, forced by `SMTP_REQUIRE_TLS`); 465 implies implicit TLS; localhost relay refused in production; auth kinds are marked sensitive |
| `apps/web/lib/server/rate-limit.test.ts` | 5 | window opens/counts/resets; refusal after max; per-subject and per-bucket keys; auth buckets stricter than human use |
| `scripts/sonara-migrate.test.mjs` | 15 | deterministic UUIDv8 ids; schema-version refusal; unknown collections preserved; duplicate id/slug/order/txRef detection; self-approval and unpublished-approval refused; simulator quarantine with the subscription attached to it; no password hash/session/token/outbox in exports; episode ordering + free allowance; exact source URLs and access overrides; requires-profiles ordering; SQL escaping; report contents; sample content/fixture accounts excluded; `human_produced` accepted |

### Database suite `11_wave2_backend.sql` (one file, adversarial)

Covers: signup profile provisioning with metadata that tries to set a role; staff permission matrix consistency;
`staff_can` gating; terms acceptance; account deletion request; rate limiter accounting in SQL; audit hash chain
(append, verify, tamper detection); staff user directory; own-session listing and revocation; public source summary
(no URL for premium content); and the 0170 privilege baseline (client roles have no TRUNCATE; `anon` has no
EXECUTE on internal helpers).

### Application changes

- `apps/web/middleware.ts` + `lib/security-headers.ts` — per-request nonce CSP, HSTS on HTTPS, COOP; media origins
  derived from the verified stream registry, never hard-coded in components.
- `apps/web/lib/server/rate-limit-core.ts` — pure limiter split out for testing; the distributed Postgres limiter is
  used when the Supabase backend is active.
- `apps/web/components/studio-ui.tsx` — `Field` now generates and wires an id, so every workspace form control has a
  label even when a call site forgot `htmlFor`. This closed 12 accessibility findings in the smoke run.
- `packages/config/src/env.ts` — `SUPABASE_SECRET_KEY`, `SUPABASE_DB_URL` and `SMTP_PASS` added to
  `SERVER_ONLY_KEYS` so a bundle scan treats them as server-only.
- `.env.example` — documents `SONARA_BACKEND`, the Supabase values, the pooler URL and the SMTP block.
- `scripts/sonara-migrate.mjs` — new; dry-run only, never connects to a database.

---

## 4. Security header evidence

Captured from the running **development** server:

```
$ curl -sI http://127.0.0.1:3100/ | grep -iE 'content-security|x-frame|nosniff|referrer|permissions|strict-transport|cross-origin'
x-content-type-options: nosniff
referrer-policy: strict-origin-when-cross-origin
x-frame-options: DENY
permissions-policy: camera=(), microphone=(self), geolocation=(), payment=(self)
content-security-policy: default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none';
  frame-src 'none'; form-action 'self'; script-src 'self' 'nonce-…' 'unsafe-eval' 'unsafe-inline';
  style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:;
  media-src 'self' blob: https://beatfm.edge.cloudrad.io https://capitalfm.cloudrad.io
    https://cast5.asurahosting.com https://radiosimba-atunwadigital.streamguys1.com https://stream.hydeinnovations.com;
  connect-src …same origins… ws: wss:; font-src 'self' data:; worker-src 'self' blob:; manifest-src 'self'
cross-origin-opener-policy: same-origin
```

`strict-transport-security` is **absent**, correctly, because this is plain HTTP. The unit test pins its value for
an HTTPS request (`max-age=63072000; includeSubDomains`, no `preload`).

Browser check (dev, 10 routes: `/`, `/medical-chronicles`, `/radio`, `/podcasts`, `/watch`, `/subscribe/listener`,
`/auth/login`, `/admin`, `/studio`, `/library`): every route rendered, **16–33 scripts per page, all but one
nonce-stamped** (the remaining one is a same-origin script allowed by `'self'`), **0 CSP violations**, 3
stylesheets loaded.

Production check (journey `SEC-HDR`): `script-src` contains the nonce and `strict-dynamic` and **no**
`unsafe-inline`/`unsafe-eval`; `object-src 'none'`, `frame-ancestors 'none'`; no HSTS over HTTP; three pages loaded
with **zero** "Refused to …" console entries.

---

## 5. Browser journeys (production build)

27 / 27 checks passed. The 26 Wave 1 journeys are unchanged; the new one is `SEC-HDR`.

| Group | Checks | Notable evidence |
|---|---|---|
| Security headers | SEC-HDR | CSP nonce + strict-dynamic, no unsafe-inline in production, 0 violations on three pages |
| Listener | L-1, L-2, L-3, L-4, L-5, L-6, L-8/P-7, L-9, SEC | register → verify → sign in; free allowance; third episode locked in UI **and** API; premium audio actually plays; another user's data inaccessible; reset link single-use and revokes sessions |
| Payments (simulator) | P-2, P-4, P-1/P-3/P-6, P-5/P-8 | verified payment grants entitlement; duplicate webhook is idempotent; pending/failed/mismatch grant nothing; forged webhook rejected; reconciliation lists the mismatch |
| Admin + Medical Chronicles | A-boot, A-5, A-roles, A-6, A-1, A-4, MC-1, MC-2/MC-3, MC-8, MC-9a, C-6, MC-7 | first super admin; self-role change refused; audited role grant; audit chain verifies; plan management; ordinary user blocked from admin; series creation; NotebookLM validation; unapproved episode not public; author cannot approve own episode; published episode links out (provider-controlled); unavailable source state |
| Runtime | JS | no uncaught page exceptions |

### Responsive / accessibility smoke

**69 route/viewport combinations** (23 routes × 375 / 768 / 1440), production build:

- **0** horizontal-overflow pages, **0** unnamed controls, **0** unlabelled form fields, **0** duplicate ids,
  **0** images without alt, **0** console errors, **0** dead buttons, **0** dead links.
- Every page has exactly one `h1`, `lang="en-UG"` and a working first tab stop (`Skip to content`).
- **65 sub-24 px pointer targets**, all of them inline text links (back-links, row titles such as
  "← All stations", "Uganda Cranes: the road to AFCON"). No icon control is undersized. WCAG 2.5.8 exempts
  inline links in text; the remaining ones are cosmetic rather than blocking.
- Home timing on this machine: TTFB 52 ms, FCP 160 ms, load 193 ms, 10 kB transferred for the document.
- Studio journeys in the same run: radio playback, podcast and video preview, favourite, search (results and empty
  state), recording (timer reached 0:03, blob preview produced), role switch, unknown-slug empty state — all
  behaved, with no console errors.

Before this run the studio forms produced 12 unlabelled-field findings; `Field` now generates and wires an id, and
the re-run is clean. That is the only product defect the smoke run found in Wave 2.

---

## 6. Paying for a subscription in the simulator — what that does and does not prove

Proven: the checkout → webhook → server-side verification → entitlement → receipt → cancellation path, idempotency,
amount/currency/reference mismatch rejection, forged-signature rejection, grace after cancellation, and that a
pending or failed payment never grants access.

**Not proven:** that Flutterwave's sandbox behaves the same way. The 12-item sandbox checklist (in
`SONARA_FLUTTERWAVE_INTEGRATION.md` §8) is deliberately all "not run". A simulator passes because we wrote it.

---

## 7. Known gaps carried into Wave 3

| Gap | Severity | Where it is tracked |
|---|---|---|
| Media is still `local_dev` disk; production refuses it | Blocks production | Wave 3 (R2 + signed URLs) |
| Podcast/video review, stations, reports, rights, creator readiness are browser-storage demos | Product gap | Wave 4/5 |
| Creator Studio (20 routes) not migrated | Product gap | Wave 4 |
| No CAPTCHA on registration | Medium | F-15 / N-6 |
| Webhook processing is synchronous | Low | N-8 |
| `app_private` helpers executable by `anon` (read-only predicates) | Low | F-15 residual |
| HSTS/edge TLS configuration is a deploy task | Deploy | Wave 6 |
| Lint not configured | Process | Roadmap 0.2 |
| Analytics are not real event data | Product | Waves 5–6 |

---

## 8. How to reproduce this report

```bash
export PATH="$HOME/.nvm/versions/node/v22.23.5/bin:$PATH"   # node 22; node 26 breaks the strip-types flag

# Unit + database + typecheck
pnpm verify

# Migration dry run on real development data (never connects to a database)
node scripts/sonara-migrate.mjs --data-dir apps/web/.data --out .tmp/sonara-migration
less .tmp/sonara-migration/report.md

# Browser acceptance against a production build (isolated data dir and dist dir)
cd apps/web
export SONARA_DATA_DIR=/tmp/sonara-e2e-data && rm -rf "$SONARA_DATA_DIR"
SONARA_BACKEND=dev NEXT_DIST_DIR=.next-build SONARA_ALLOW_DEV_BACKEND=1 npx next build
NODE_ENV=development pnpm sonara:dev seed-sample
NEXT_DIST_DIR=.next-build SONARA_BACKEND=dev SONARA_ALLOW_DEV_BACKEND=1 \
  SONARA_APP_URL=http://127.0.0.1:3110 npx next start --port 3110 --hostname 127.0.0.1 &
cd ../..
node scripts/sonara-e2e.mjs http://127.0.0.1:3110 /tmp/sonara-e2e-data

# Responsive + accessibility evidence
node scripts/browser-smoke.mjs http://127.0.0.1:3110 .tmp/smoke

# Local Supabase stack (optional; needs Docker + Supabase CLI)
supabase start && supabase db reset
SONARA_TEST_TARGET=supabase-local DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55422/postgres pnpm test:db
```

`SONARA_ALLOW_DEV_BACKEND=1` here is for a localhost smoke build only. **Never set it on a real deployment.**

---

## 9. Sign-off checklist after the owner creates the project (D-2)

1. [ ] Create the dedicated Sonara project, never the healthcare one (`SONARA_SUPABASE_SETUP.md` §1).
2. [ ] Apply migrations 0001–0180 in order; verify every ordinary table has RLS.
3. [ ] `SONARA_TEST_TARGET=supabase-local … pnpm test:db` against the local stack (11/11).
4. [ ] Point `.env.local` at the project; confirm the app refuses to start with one value removed.
5. [ ] Register, verify, sign in, reset, sign out; check `/account/devices`.
6. [ ] Grant the first `super_admin` through `grant_platform_role`; confirm `/admin/audit-logs` shows it.
7. [ ] Confirm a normal user cannot reach `/admin` and cannot change their own roles.
8. [ ] Create a series and episode; confirm the free allowance and that an unapproved episode is not public.
9. [ ] Attempt an RLS bypass (read another user's row, insert a role, update a payment) — all must fail.
10. [ ] Configure SMTP in Supabase Auth and `SONARA_EMAIL_PROVIDER=smtp`; send one verification and one receipt.
11. [ ] Flutterwave test keys; run the 12 sandbox checks; record each result in §6 of this document.
12. [ ] Only then discuss live payments (KYC + explicit approval) and media storage (Wave 3).

Until every box is ticked against a real project, Sonara is a working local product with a prepared, tested
backend — not a production service.
