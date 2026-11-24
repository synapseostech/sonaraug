# Local development

## Prerequisites

| Tool | Version | Why |
|---|---|---|
| Node | 22.x (`.nvmrc`) | Expo/Metro and Next are not validated on 24+/26 |
| pnpm | 12.x | workspace protocol |
| PostgreSQL **server** 16 | for `pnpm test:db` only | schema + RLS tests |
| Docker | optional | only if you prefer `supabase start` |

> This machine has Node 26 as the default and Node 22.23.5 installed under nvm.
> Run `nvm use` in the repo before anything else. `.node-version` exists for
> tooling that does not use nvm.

## Install

```bash
nvm use
pnpm install
```

## Everyday commands

```bash
pnpm typecheck        # strict TypeScript, all packages
pnpm test             # unit tests (node:test + native type stripping, no deps)
pnpm test:db          # throwaway Postgres → migrations → fixtures → RLS suites
KEEP_CLUSTER=1 pnpm test:db   # leave the cluster running on port 55432 for debugging
```

Connect to the test cluster after a `KEEP_CLUSTER=1` run:

```bash
psql -h /tmp/kito-pgtest-$(id -u) -p 55432 -U postgres -d kito_test
```

## Adding a migration

1. New file in `supabase/migrations/`, next number in sequence. Never edit an
   applied migration.
2. Add or update a test in `supabase/tests/rls/` if it touches RLS, grants or a
   trigger.
3. `pnpm test:db` until green, then `pnpm verify`.

## Troubleshooting

**`pg_ctl: could not start server`** — a previous run left a postmaster. The
runner now stops stale instances automatically; if it persists,
`rm -rf .tmp/pgdata`.

**`invalid argument: "Player/.tmp"`** — the repo path contains a space. Postgres
sockets now live in `/tmp/kito-pgtest-$UID` for this reason.

**`permission denied for table X`** in a test — this is the *expected* behaviour
for a denied write. Use `tests.assert_denied(...)`; use `tests.assert_affected(..., 0, ...)`
when RLS filters rows silently.

**RLS test fails after a policy change** — check whether the new policy makes a
row invisible to the role that is updating it. Postgres rejects the update with
"new row violates row-level security policy" (see ADR-0006).

## Not yet available locally

- `supabase start` (CLI not installed; Docker images not pulled)
- `ffmpeg` (not installed; media probing is server-side by design)
- Android/iOS builds (no JDK/Android SDK/Xcode on this machine — use EAS Build)
