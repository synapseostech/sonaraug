# Sonara — Dedicated Supabase Project Setup

**Updated:** 2026-11-23 · **Status:** the application, adapter and migrations are ready; **no project has been
created** (decision D-2). This document is the exact procedure for the owner to create the dedicated Sonara
project and connect it. Nothing here was executed against a hosted project.

> **Never use the healthcare Supabase project.** Sonara needs its own project, its own database, its own keys and
> its own auth users. Do not reuse an organisation, project or service-role key from any other product.

> **Never paste the service key, database URL or SMTP password into a chat.** Put them in `.env.local` on the
> machine that runs the app. Values marked *server-only* below must never be committed or sent to a browser.

---

## 0. What you need

| Requirement | Notes |
|---|---|
| A Supabase account | Free tier is enough to verify the migration; production sizing is a later decision |
| Supabase CLI (optional) | `npx supabase --version`. Only needed for a **local** stack; the hosted project is created in the dashboard |
| PostgreSQL client `psql` | `psql --version` (16 recommended). Already used by `pnpm test:db` |
| Node 22 | `node -v` → `v22.x` (the repo pins `>=22.11 <23` in `.nvmrc`) |
| pnpm 12 | `pnpm -v` |

---

## 1. Create the project

1. Sign in at <https://supabase.com/dashboard> and choose **New project**.
2. **Organisation:** a Sonara-owned organisation, not the one that holds the healthcare project.
3. **Name:** `sonara-prod` (or `sonara-staging`). The name appears in the database URL; keep it recognisable.
4. **Region:** the closest region to Uganda that is available to you — `eu-central-1` (Frankfurt) or
   `af-south-1` (Cape Town) are the realistic choices. Latency to Flutterwave and to listeners matters more
   than to this build machine.
5. **Database password:** generate a long random one and store it in your password manager. You need it once, for
   the connection string.
6. Wait for provisioning, then **save the project reference** (the subdomain in `https://<ref>.supabase.co`).

Do not create tables by hand. The schema comes only from `supabase/migrations`.

---

## 2. Collect the four values

| Dashboard location | Value | Goes into | Exposure |
|---|---|---|---|
| Project Settings → API → Project URL | `https://<ref>.supabase.co` | `NEXT_PUBLIC_SUPABASE_URL` | public (browser) |
| Project Settings → API → API keys → **publishable** / anon key | `sb_publishable_…` or the legacy anon JWT | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | public (browser) |
| Project Settings → API → API keys → **secret** / service_role key | `sb_secret_…` or the legacy service_role JWT | `SUPABASE_SECRET_KEY` | **server-only** |
| Project Settings → Database → Connection string → **Session pooler** | `postgresql://postgres.<ref>:<password>@aws-…pooler.supabase.com:5432/postgres` | `SUPABASE_DB_URL` | **server-only** |

Notes:

- Use the **session pooler** string (port 5432 on the pooler host), not the direct database host: the direct host
  is IPv6-only on new projects and many CI/egress networks cannot reach it. The adapter uses `pg` with
  `ssl: { rejectUnauthorized: true }` for any non-localhost host.
- The publishable key and the secret key must differ. The backend refuses to start if they are equal or if the
  secret looks like a publishable key (`lib/server/backend-config.ts`, unit-tested).
- Legacy keys still work; new projects issue the new names. The code reads the new names only.

---

## 3. Configure Auth (before the first sign-up)

In **Authentication → Providers → Email**:

| Setting | Value | Why |
|---|---|---|
| Enable email provider | on | Password accounts are the only method in this wave |
| Confirm email | **on** | The product requires a verified email before subscribing or applying as a creator |
| Minimum password length | **10** | Matches `packages/auth` and the UI copy |
| Secure email change | on | Prevents silent email takeover |

In **Authentication → URL Configuration**:

- **Site URL:** `https://<your Sonara domain>` (for local work, `http://127.0.0.1:3100`).
- **Redirect URLs:** add every origin you will use, each with the two paths the app relies on:
  - `http://127.0.0.1:3100/auth/callback`
  - `http://127.0.0.1:3100/auth/reset-password`
  - the same two on the staging and production domains.

In **Authentication → Emails** (SMTP): authentication mail (verification, recovery) is sent by Supabase, not by
Sonara. Configure a real SMTP relay there with SPF/DKIM for the sending domain before inviting real people; see
`SONARA_EMAIL_CONFIGURATION.md`. Until then, do not register anyone whose address you do not control.

Do **not** enable:

- anonymous sign-ins (the schema supports listeners without accounts, but the app has no flow for it yet);
- phone auth (no approved SMS provider, and Ugandan numbers would be an unplanned cost);
- third-party providers (Google is a planned, not current, feature).

**Roles never come from metadata.** `raw_user_meta_data` is used only to suggest a display name; staff roles are
rows in `public.platform_roles` written by the audited `grant_platform_role` RPC. Setting
`{"role":"super_admin"}` in user metadata grants nothing.

---

## 4. Apply the migrations

The migration files are plain SQL, applied in filename order. The supported path is `psql` (the Supabase CLI
expects 14-digit timestamps in file names, which these historical names do not have):

```bash
export SUPABASE_DB_URL='postgresql://postgres.<ref>:<password>@aws-…pooler.supabase.com:5432/postgres'

# 1. Check the connection first.
psql "$SUPABASE_DB_URL" -c 'select current_database(), version();'

# 2. Apply every migration in order, stopping at the first error.
for f in supabase/migrations/*.sql; do
  echo "→ $(basename "$f")"
  psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -q -f "$f" || { echo "FAILED: $f"; break; }
done

# 3. Verify the expected objects exist.
psql "$SUPABASE_DB_URL" -c "select count(*) as tables from information_schema.tables where table_schema = 'public';"
psql "$SUPABASE_DB_URL" -c "select key, value from public.platform_settings where key like 'policy.%';"
psql "$SUPABASE_DB_URL" -c "select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and not relrowsecurity;"
```

The last query must return **no rows** (every ordinary table has RLS enabled; partitioned parents are covered by
the 0110 policies and `0010` triggers).

Migrations 0150–0180 exist specifically for this move: enum additions in their own transaction, the Wave 2
backend support tables/RPCs, an explicit revoke of Supabase's default `anon`/`authenticated` table privileges
(N-9), and the application-support functions (play counts, reviewer names, session revocation).

All migrations are written to be **re-runnable where practical**: they use `if not exists`, `create or replace`
and `on conflict do nothing` for reference data. Review each file's header: it states what reversal means.

### Optional: a local Supabase stack

If you have Docker and the Supabase CLI, `supabase start` gives you the same schema locally without a hosted
project. Then run the RLS suites against it:

```bash
supabase start
supabase db reset                       # applies supabase/migrations + seed.sql
SONARA_TEST_TARGET=supabase-local \
  DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55422/postgres \
  pnpm test:db
```

The harness refuses any host other than `127.0.0.1`/`localhost`, so this command can never touch a hosted project.

---

## 5. Configure the application

Create `apps/web/.env.local` (never commit it):

```bash
# --- backend selection ---
SONARA_BACKEND=supabase
NODE_ENV=development            # `next dev` sets this; listed so the next block is obvious
SONARA_TRUST_PROXY=0            # no proxy in front of a local dev server

# --- Supabase ---
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=…        # public
SUPABASE_SECRET_KEY=…                          # server-only
SUPABASE_DB_URL=postgresql://…                 # server-only (session pooler)

# --- app ---
SONARA_APP_URL=http://127.0.0.1:3100
SONARA_MAX_AUDIO_MB=300
SONARA_DB_POOL_MAX=10

# --- email (see SONARA_EMAIL_CONFIGURATION.md) ---
SONARA_EMAIL_PROVIDER=log                      # nothing is sent; deliveries are recorded
EMAIL_FROM='Sonara <no-reply@example.invalid>'

# --- payments (see SONARA_FLUTTERWAVE_INTEGRATION.md) ---
SONARA_PAYMENTS_MODE=simulator                 # keep the simulator until sandbox keys exist
```

Then:

```bash
pnpm install
pnpm verify          # typecheck + 240 unit tests + 11 database suites
pnpm --filter @kito/web dev
```

If a required value is missing or malformed the app throws `BackendConfigError` on the first request and says
exactly which values are wrong. It never falls back to the local store in production.

### First administrator

A fresh project has no staff. Create your own account through `/auth/register`, confirm the email, then grant the
first role **once**, from the SQL editor as the project owner (or with `psql` and a role that may bypass RLS):

```sql
select id, email from auth.users where email = 'you@example.org';
select public.grant_platform_role('<uuid from above>', 'super_admin');
```

The RPC writes an audit event. After that, every further role change goes through `/admin/users` and is audited;
no SQL is needed. Never grant roles by editing user metadata, and never give a second person your own account.

---

## 6. Verify the connection from the app

1. `GET /` — public content renders (the adapter reads through RLS as `anon`).
2. `/auth/register` → confirm the email via the Supabase link → `/account` shows your profile.
3. `/admin` as the super admin → overview, users, audit log.
4. `/admin/medical-chronicles` → create a draft series and episode. Sample content is flagged `is_sample`.
5. Sign out, sign in again; open `/account/devices` — the session list comes from `public.my_sessions()`.
6. Stop the app, unset `SUPABASE_DB_URL`, start it again: the app must refuse to serve, naming the missing value.
   This is the fail-closed check from Wave 2 §6 — record the result.

### Where the data goes

`lib/server/data.ts` is the boundary. With `SONARA_BACKEND=supabase`, every read/write loads only the rows named
in that service's `scope`, as the caller's identity, inside a transaction that sets
`role authenticated` (or `anon`) plus the JWT claims — so RLS is the enforcement layer, not the application. The
service role is used only for the payment processor, notifications, email delivery logs, audit of self-service
actions, media registration and display-only lookups, each with a reason string at the call site.

---

## 7. Migrate the development data (optional, and only after the above is green)

The dev store is not production data. Read `SONARA_BACKEND_MIGRATION.md` first. The short version:

```bash
node scripts/sonara-migrate.mjs --data-dir apps/web/.data --out .tmp/sonara-migration
less .tmp/sonara-migration/report.md
```

Simulator payments are quarantined and are never converted into financial records. User accounts are re-created
through Supabase Auth; password hashes are not portable and are not exported.

---

## 8. What this setup does **not** give you

- **Media storage.** Uploads still use `local_dev` disk storage, which the app refuses in production. R2 (or the
  chosen provider) and signed URLs are Wave 3.
- **A live payment account.** Flutterwave test keys and sandbox acceptance are separate; live payments need
  explicit approval and completed KYC.
- **Email deliverability.** A relay and domain authentication are owner decisions.
- **Backups and PITR.** Configure them in the dashboard before any real listener data exists, and run a restore
  drill.
- **Production readiness.** See `SONARA_WAVE_2_ACCEPTANCE.md` for what is proven and what is not.

---

## 9. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `BackendConfigError: NEXT_PUBLIC_SUPABASE_URL is missing or not a URL` | `.env.local` not loaded (wrong directory) or empty value | Put the file in `apps/web/`, restart `next dev` |
| `SUPABASE_DB_URL must use https` / `postgres://` errors | The URL is quoted incorrectly or uses `postgres://user:pass@host/db?sslmode=…` with an unescaped password | URL-encode the password; keep the scheme `postgresql://` |
| `password authentication failed` | Wrong password, or the pooler username lacks the `.<ref>` suffix | Copy the session-pooler string verbatim |
| `permission denied for table …` as a signed-in user | The migration step was skipped (0170 missing) or the user has no role | Re-apply 0170; check `public.platform_roles` |
| Everything is empty after signing in | RLS is working and the account has no data / no role | Create content as an admin; check `select * from public.profiles where id = auth.uid()` |
| `could not find the '…' column` | Migrations applied partially | Re-run from the failing file; the files are ordered |
| Auth emails never arrive | Supabase's built-in SMTP is rate-limited and for testing only | Configure your own SMTP in Auth settings |
| `new row violates row-level security policy` on insert | Correct behaviour: the action is not permitted for that identity/role | Check the role and the table's policy; do not disable RLS |
