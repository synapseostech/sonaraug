# Sonara — Vercel Deployment

## Project shape

- Framework: Next.js 15.5.29
- Package manager: pnpm 12.21.0
- Node.js: 22.23.5 or another release satisfying `>=22.11.0 <23`
- Monorepo: pnpm workspace + Turborepo
- Web application: `apps/web`
- Workspace packages: `packages/*`

## Recommended Vercel settings

| Setting | Value |
|---|---|
| Framework preset | Next.js |
| Root Directory | `apps/web` |
| Include files outside Root Directory | Enabled (workspace packages are in `packages/*`) |
| Install command | Auto-detected pnpm workspace install; if overriding, `pnpm install --frozen-lockfile` |
| Build command | `pnpm run build` |
| Development command | `pnpm run dev` |
| Output directory | Next.js default (`.next`) |
| Node.js version | 22.x |
| Production branch | `main` |
| Preview deployments | enabled only after required Preview variables are supplied |

Vercel should import `apps/web` as a single Next.js project, not group the repository root as “Services.” Enable access to files outside the Root Directory so pnpm can resolve `@kito/*` workspace packages. Do not import `apps/admin` or `apps/studio` as the public Sonara app.

Do not set `SONARA_ALLOW_DEV_BACKEND=1`, `SONARA_BACKEND=dev`, or `SONARA_DATA_DIR` on Vercel. Do not add `vercel.json` unless native Next.js detection proves insufficient.

## Required build-time configuration

Production builds read and validate:

```text
NODE_ENV=production
SONARA_BACKEND=supabase
SONARA_APP_URL=https://<preview-or-production-domain>
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<browser publishable key>
SUPABASE_SECRET_KEY=<server secret key>
SUPABASE_DB_URL=postgresql://...<session-pooler-host>.../postgres
```

Because pages are statically or dynamically prerendered, these values must be available in Vercel **before the build**, not only during a later function invocation.

## Preview deployments

Use a separate Supabase preview project or explicitly approved staging credentials. Set the Preview environment with a preview Supabase project, preview app URL, and payments disabled. `SONARA_ALLOW_DEV_BACKEND` must remain unset.

## Serverless compatibility

- Supabase is the production persistence adapter.
- The production local JSON store refuses to start.
- Local media uploads refuse to run in production until R2/Stream is implemented.
- The development Flutterwave simulator and `/dev/outbox` return 404 in production.
- The rate limiter uses Postgres in Supabase mode; the in-memory limiter is development-only.
- Scheduled billing/email jobs are not implemented. No Vercel cron configuration should be added as a substitute until a worker contract exists.

## Verification

```bash
nvm use
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm run test
pnpm run test:db
pnpm --filter @kito/web build
```
