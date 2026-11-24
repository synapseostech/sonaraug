# Sonara — Ugandan digital media platform

> Internal codename `kito` (`@kito/*` packages). Start with [docs/SONARA_PRODUCT_ARCHITECTURE.md](docs/SONARA_PRODUCT_ARCHITECTURE.md).

Live radio, podcasts and video for Uganda, built as an independent platform:
own database, own administration, no dependency on another media company's
identity or infrastructure.

> **Codename.** `kito` is a working name. The commercial brand is decided later;
> every user-facing string is configurable (see `docs/decisions/ADR-0002`).

---

## Build status (honest)

| Area | State |
|---|---|
| Monorepo, TypeScript strict, task graph | ✅ working |
| Brand/config, design tokens, feature flags | ✅ working (+28 tests) |
| Playback capability + resilience model | ✅ working (+27 tests) |
| Validation schemas (incl. SSRF guard) | ✅ working (+17 tests) |
| Permission model (studio/admin) | ✅ working (+10 tests) |
| Analytics catalogue with consent + PII guards | ✅ working (+8 tests) |
| PostgreSQL schema, 40+ tables, constraints | ✅ applied and tested locally |
| Row Level Security + business-rule triggers | ✅ 6 RLS suites passing |
| Medical Chronicles, accounts, subscriptions, admin (server-side) | ✅ working on a **local development store**; 26 browser journeys |
| Flutterwave payments | ⚠️ implemented; tested against a local simulator only; live disabled |
| Studio / broadcaster workspaces | ⚠️ browser-storage demo |
| Supabase project, R2, Stream, Vercel | ⚠️ **not provisioned** (needs owner approval + credentials) |
| Auth flows, media upload, RSS import, stream prober | ⚠️ designed, not implemented |

Nothing is deployed. No cloud resources have been created. No money has been spent.

---

## Quick start

```bash
nvm use            # Node 22 (.nvmrc)
pnpm install
pnpm typecheck     # strict TS across every package
pnpm test          # unit tests (no dependencies beyond Node)
pnpm test:db       # schema + RLS suites on a throwaway local Postgres
```

`pnpm test:db` needs PostgreSQL 16 server binaries (`initdb`, `pg_ctl`,
`pg_isready`) — it does **not** need Docker, sudo, or a Supabase project.

---

## Layout

```
apps/
  web/      Next.js listener web + PWA      (shell)
  mobile/   Expo + React Native listener    (shell)
  studio/   Broadcaster & creator tools     (shell)
  admin/    Platform control centre         (shell)
packages/
  config/      brand, design tokens, env validation, feature flags
  types/       status unions and API projections
  validation/  zod schemas shared by clients and edge functions
  media/       playback state machine, capabilities, failover
  auth/        permission matrix
  analytics/   typed events, consent gating, PII guards
supabase/
  migrations/  numbered SQL, applied in order
  tests/       RLS matrix + fixtures + local harness
workers/       cron-invoked handlers (see ADR-0007)
docs/          architecture, product, security, operations, decisions
```

---

## Principles we hold to

1. **The database is the security boundary.** RLS is tested, not assumed.
2. **Live radio is radio.** No seek bar, no fake pause, no catch-up without rights.
3. **No fabricated content.** Fixtures are labelled as fixtures; nothing is
   seeded as if it were a real broadcaster.
4. **Bytes never touch Postgres.** Media lives in R2/Stream; the database holds
   metadata and status only.
5. **Every paid placement is labelled.** Advertising is opt-in per surface and
   measured server-side.

---

## Documentation

- `docs/product/prd.md` — requirements, personas, journeys, acceptance criteria
- `docs/product/backlog.md` — epics, stories, priorities
- `docs/architecture/overview.md` — system design, ERD, RLS matrix
- `docs/security/security-model.md` — threats, controls, compliance status
- `docs/security/copyright-and-rights.md` — what must be true before launch
- `docs/operations/getting-started.md` — local setup and troubleshooting
- `docs/decisions/` — ADRs
