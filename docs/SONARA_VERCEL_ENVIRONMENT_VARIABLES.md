# Sonara — Vercel Environment Variables

No real values belong in this document or in Git.

## Core application

| Variable | Purpose | Required | Secret | Timing / environments | Source |
|---|---|---|---|---|---|
| `SONARA_APP_URL` | Absolute HTTPS base URL for auth, email links and callbacks | Production yes | No | Build + runtime; Production, Preview | Vercel domain or approved preview URL |
| `SONARA_BACKEND` | Select `supabase` or `dev` | Production yes | No | Build + runtime; set `supabase` in Production and Preview | Sonara configuration |
| `SONARA_TRUST_PROXY` | Trust Vercel forwarded client IP; `0` disables | Optional; recommended `1` | No | Runtime; Production, Preview | Sonara setting |
| `SONARA_DB_POOL_MAX` | PostgreSQL pool size | Optional; default `10` | No | Runtime | Owner tuning |
| `SONARA_MAX_AUDIO_MB` | Upload size limit | Optional; default `300` | No | Runtime | Owner tuning |
| `SONARA_SUPPORTED_CURRENCIES` | Informational supported-currency list | Optional | No | Runtime | Product setting |
| `NEXT_PUBLIC_MARKETING_SITE` | Public marketing URL | Optional | No | Build + runtime | Brand owner |
| `NEXT_PUBLIC_BRAND_NAME` | Public brand name | Optional; default Sonara | No | Build + runtime | Brand owner |
| `NEXT_PUBLIC_BRAND_TAGLINE` | Public tagline | Optional | No | Build + runtime | Brand owner |
| `NEXT_PUBLIC_BRAND_ACCENT` | CSS accent colour | Optional | No | Build + runtime | Brand owner |
| `BRAND_SUPPORT_EMAIL` | Support address | Optional | No | Build + runtime | Brand owner |
| `BRAND_LEGAL_ENTITY` | Legal entity name | Optional until launch | No | Build + runtime | Owner/legal |
| `BRAND_DEFAULT_LOCALE` | Default locale | Optional; default `en-UG` | No | Build + runtime | Brand owner |
| `FF_ENABLE_DOWNLOADS` | Download feature | Optional; default false | No | Build + runtime | Feature owner |
| `FF_ENABLE_COMMENTS` | Comments feature | Optional; default true | No | Build + runtime | Feature owner |
| `FF_ENABLE_ADVERTISING` | Advertising feature | Optional; default false | No | Build + runtime | Feature owner |
| `DATA_SAVER_DEFAULT` | Data-saver default | Optional; default true | No | Build + runtime | Product owner |

## Supabase

| Variable | Purpose | Required | Secret | Timing / environments | Source |
|---|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project API URL | Production yes | Public | Build + runtime; Production, Preview | Supabase Project Settings |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser publishable key | Production yes | Public | Build + runtime; Production, Preview | Supabase API keys |
| `SUPABASE_SECRET_KEY` | Server auth/admin operations and RLS-bypass service operations | Production yes | Secret | Runtime; Production, Preview | Supabase API keys |
| `SUPABASE_DB_URL` | Hosted Postgres session-pooler URL | Production yes | Secret | Runtime; Production, Preview | Supabase Database Settings |
| `SUPABASE_ACCESS_TOKEN` | CLI/migration automation only | Optional; not application runtime | Secret | Local/CI only | Supabase Account Tokens |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Legacy compatibility name | Optional in current web app | Public | Build + runtime | Supabase API keys |
| `SUPABASE_SERVICE_ROLE_KEY` | Legacy compatibility name | Optional; not the preferred current key | Secret | Runtime; local/other apps only | Supabase API keys |

## Resend / SMTP

The application does not contain a Resend SDK. It uses Nodemailer SMTP.

| Variable | Purpose | Required | Secret | Timing / environments | Source |
|---|---|---|---|---|---|
| `SONARA_EMAIL_PROVIDER` | `smtp`, `log`, or `none` | Production: recommended `log` until SMTP is approved | No | Runtime | Owner |
| `SMTP_HOST` | SMTP relay host | With `smtp` | No | Runtime | Resend or other SMTP provider |
| `SMTP_PORT` | SMTP port | With `smtp`; default 587 | No | Runtime | Provider |
| `SMTP_SECURE` | Implicit TLS | Optional | No | Runtime | Provider |
| `SMTP_REQUIRE_TLS` | Require STARTTLS | Optional; remote default true | No | Runtime | Sonara/provider |
| `SMTP_USER` | SMTP login | Depends on relay | Secret if credentials | Runtime | Provider |
| `SMTP_PASS` | SMTP password/API credential | Depends on relay | Secret | Runtime | Provider |
| `EMAIL_FROM` | Authorized sender address | With `smtp` | No | Runtime | Provider/domain |

Supabase Auth SMTP is configured separately in the Supabase dashboard for verification and password reset. It has no Sonara environment variable.

## Flutterwave

| Variable | Purpose | Required | Secret | Timing / environments | Source |
|---|---|---|---|---|---|
| `SONARA_PAYMENTS_MODE` | `simulator` or `flutterwave`; use `unconfigured`/unset in production until approved | Production: set `flutterwave` only for sandbox testing | No | Runtime | Owner |
| `FLW_ENVIRONMENT` | `test` or `live`; use `test` only now | Sandbox test | No | Runtime | Flutterwave dashboard |
| `FLW_PUBLIC_KEY` | Public checkout key | With Flutterwave mode | Public | Runtime | Flutterwave dashboard |
| `FLW_SECRET_KEY` | Server API key | With Flutterwave mode | Secret | Runtime | Flutterwave dashboard |
| `FLW_WEBHOOK_SECRET_HASH` | Webhook `verif-hash` | With Flutterwave mode | Secret | Runtime | Flutterwave dashboard; random value >=16 chars |
| `FLW_API_BASE` | API base override | Optional | No | Runtime | Default API; no need to set |
| `FLW_LIVE_APPROVED` | Additional live-mode gate | Optional; must remain unset or not `yes` | No | Runtime | Owner approval |

## Media / R2 / Stream

These variables are currently deferred. Production media storage is not implemented, and uploads are disabled.

| Variable | Purpose | Required now | Secret | Source |
|---|---|---|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account | No | Public identifier | Cloudflare |
| `CLOUDFLARE_API_TOKEN` | R2/Stream API | No | Secret | Cloudflare |
| `R2_BUCKET_MEDIA` | Media bucket | No | No | Cloudflare |
| `R2_ACCESS_KEY_ID` | R2 credential | No | Secret | Cloudflare |
| `R2_SECRET_ACCESS_KEY` | R2 credential | No | Secret | Cloudflare |
| `R2_ENDPOINT` | R2 S3 endpoint | No | Public URL | Cloudflare |
| `STREAM_WEBHOOK_SECRET` | Stream webhook verification | No | Secret | Cloudflare |

## Monitoring

| Variable | Purpose | Required | Secret | Source |
|---|---|---|---|---|
| `SENTRY_DSN` | Server Sentry DSN | Optional | No, but keep server-only | Sentry |
| `NEXT_PUBLIC_SENTRY_DSN` | Browser Sentry DSN | Optional | Public DSN | Sentry |
| `POSTHOG_KEY` | Analytics project key | Optional | Public | PostHog |
| `POSTHOG_HOST` | Analytics ingestion URL | Optional | Public | PostHog |

## Development-only / forbidden in production

- `SONARA_ALLOW_DEV_BACKEND` — local production-build smoke test only; never set in Vercel.
- `SONARA_DATA_DIR` — local JSON data directory; never set on Vercel.
- `SONARA_PAYMENTS_MODE=simulator` — development only.
- `CHROME`, `ROUTES`, `SKIP_JOURNEYS` — browser test scripts only.
- `NEXT_DIST_DIR` — local build isolation only.

Copy-ready names:

```text
SONARA_APP_URL
SONARA_BACKEND
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY
SUPABASE_DB_URL
SONARA_EMAIL_PROVIDER
SMTP_HOST
SMTP_PORT
SMTP_SECURE
SMTP_REQUIRE_TLS
SMTP_USER
SMTP_PASS
EMAIL_FROM
SONARA_PAYMENTS_MODE
FLW_ENVIRONMENT
FLW_PUBLIC_KEY
FLW_SECRET_KEY
FLW_WEBHOOK_SECRET_HASH
FLW_LIVE_APPROVED
FLW_API_BASE
SONARA_SUPPORTED_CURRENCIES
```
