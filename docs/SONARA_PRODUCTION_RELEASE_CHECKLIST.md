# Sonara — Production Release Checklist

This checklist is intentionally stop-at-preview: no live launch, migration, DNS, or payment activation is implied.

## Before GitHub

- [ ] Working tree contains no `.env`, key, token, database dump or private migration report.
- [ ] `.gitignore` excludes `.env*` except `.env.example`, `.vercel`, `.data`, build output and local databases.
- [ ] No force-push or history rewrite is needed.
- [ ] `pnpm install --frozen-lockfile` passes.
- [ ] `pnpm run typecheck` passes.
- [ ] `pnpm run test` passes.
- [ ] `pnpm run test:db` passes.
- [ ] Production build with Supabase credentials is run later against a dedicated preview project.
- [ ] Browser acceptance is run against the local smoke build.

## GitHub

- [ ] Remote is exactly `https://github.com/synapseostech/sonaraug.git`.
- [ ] Remote is empty or history is compatible.
- [ ] Push target is `main`.
- [ ] Commit SHA is recorded.
- [ ] Remote branch and SHA are verified.

## Vercel preview

- [ ] Root Directory is the repository root.
- [ ] Node 22.x is selected.
- [ ] Install/build commands match the deployment guide.
- [ ] Preview Supabase variables are set.
- [ ] `SONARA_ALLOW_DEV_BACKEND` is absent.
- [ ] Email provider is `log` or an approved staging relay.
- [ ] Payments are test-only or unconfigured.
- [ ] Auth redirect URLs include the preview domain.

## Supabase

- [ ] Supabase migrations are reviewed.
- [ ] Dedicated Sonara project is created.
- [ ] No hosted migration is run until explicitly approved.
- [ ] RLS tests pass locally.
- [ ] Auth redirect URLs are configured.
- [ ] Storage and media providers are provisioned or media remains disabled.

## Email

- [ ] Supabase Auth SMTP is not assumed to exist.
- [ ] Verification/recovery redirects use the preview/production domain.
- [ ] Sender domain and DNS are verified.
- [ ] Product email is `log` or SMTP staging until approved.

## Flutterwave

- [ ] Live key is absent.
- [ ] `FLW_ENVIRONMENT=test`.
- [ ] Test webhook secret is configured.
- [ ] Redirect and webhook URLs are staging-only.
- [ ] Sandbox cases are documented before launch.

## Not approved for this task

- Hosted migrations
- Vercel project connection/deployment
- Live payment keys
- DNS changes
- Production email sending
- Public launch
