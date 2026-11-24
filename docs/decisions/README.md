# Architecture Decision Records

One file per irreversible-or-expensive decision. Format: context, decision,
consequences, alternatives rejected. ADRs are append-only; a changed decision
gets a new ADR that supersedes the old one.

| ADR | Decision | Status |
|---|---|---|
| [0001](ADR-0001-monorepo.md) | Turborepo + pnpm workspaces, four apps | Accepted |
| [0002](ADR-0002-codename-and-brand.md) | Neutral codename `kito`, brand from config only | Accepted (provisional name) |
| [0003](ADR-0003-live-radio-semantics.md) | Live radio has no seek/pause/catch-up | Accepted |
| [0004](ADR-0004-video-provider.md) | Cloudflare Stream for MVP video | Accepted |
| [0005](ADR-0005-contracts-and-types.md) | Hand-written string unions + generated DB types later | Accepted |
| [0006](ADR-0006-rls-first-security.md) | RLS is the security boundary; `app_private` helpers | Accepted |
| [0007](ADR-0007-workers-as-cron-handlers.md) | Workers are cron-invoked handlers, not servers | Accepted |
| [0008](ADR-0008-local-db-testing.md) | Throwaway local Postgres + auth shim for RLS tests | Accepted |
| [0009](ADR-0009-ui-package-scope.md) | `@kito/ui` is a web UI kit; mobile does not depend on it | Accepted |
