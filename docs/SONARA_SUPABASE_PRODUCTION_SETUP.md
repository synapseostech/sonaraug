# Sonara — Supabase Production Setup

## Prerequisites

Create or identify a dedicated Sonara Supabase project. Do not use an unrelated healthcare or test project.

## Required application configuration

```text
SONARA_BACKEND=supabase
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable-key>
SUPABASE_SECRET_KEY=<secret-key>
SUPABASE_DB_URL=postgresql://...@<transaction-pooler-host>:6543/postgres
SUPABASE_DB_CA_CERT=<PEM certificate from Database Settings → SSL Configuration>
SONARA_APP_URL=https://<approved-domain>
SONARA_TRUST_PROXY=1
```

Use the transaction pooler for Vercel. Keep every `SUPABASE_*` database setting server-only. The CA certificate is public, but must remain server configuration; never place the secret key or database URL in a `NEXT_PUBLIC_*` variable.

## Migration execution (later, with approval)

1. Back up/confirm PITR is available.
2. Install the Supabase CLI and authenticate locally.
3. Link the dedicated Sonara project.
4. Review `supabase/migrations` in numeric order.
5. Run migrations only in an explicitly approved staging or production project.
6. Run `pnpm run test:db` only against the throwaway local harness; never point it at hosted credentials.
7. Verify RLS, auth, storage and seed state from the Supabase dashboard.
8. Record migration output outside Git and rotate credentials if any output is leaked.

Do not execute migrations as part of this deployment-readiness task.

## Auth

Configure Site URL and Redirect URLs in Supabase Auth:

- verification callback: `${SONARA_APP_URL}/auth/callback`
- password recovery: `${SONARA_APP_URL}/auth/reset-password`
- auth callback: `${SONARA_APP_URL}/auth/callback`

Configure SMTP separately for verification and password recovery. Email templates must use the Sonara brand, and sender DNS must be verified before real launch.

## Security model

The application uses per-request Supabase SSR cookies, verified server sessions and RLS. PostgreSQL `sb/db.ts` sets caller claims and uses RLS. The secret key is restricted to named service operations such as auth administration and payment processing.

## First administrator

After an approved hosted migration and successful registration, query the owned account and grant the first `super_admin` role with the project owner RPC described in `SONARA_SUPABASE_SETUP.md`. Never share or use another person's account.
