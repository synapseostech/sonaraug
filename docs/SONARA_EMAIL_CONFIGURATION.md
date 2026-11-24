# Sonara — Email and Notification Configuration

**Updated:** 2026-11-23 · **Status:** the abstraction, templates, retries, delivery log and development outbox are
implemented. **No real email has been sent** because no provider credentials exist. Authentication mail
(verification, password recovery) is sent by **Supabase Auth**, not by Sonara — two separate configuration steps.

---

## 1. Two senders, deliberately

| Mail | Sender | Configured in | Why |
|---|---|---|---|
| Email verification | Supabase Auth (GoTrue) | Supabase dashboard → Authentication → Emails / SMTP | The one-time link must be generated and validated by the auth server; Sonara never sees the token |
| Password recovery | Supabase Auth | same | same |
| Everything else: welcome, subscription confirmation, receipt, payment failure, renewal reminder, cancellation, creator application received/decided, episode submitted/decided/published, security notices | Sonara, through the email abstraction | `SONARA_EMAIL_PROVIDER` + SMTP variables | These are product messages with Sonara branding, templates and preferences |

The dev backend is a third case: it writes to an on-disk **outbox** shown at `/dev/outbox` (404 in production)
so a verification or reset link can be followed locally. That outbox is not a production mechanism.

---

## 2. Message catalogue

Templates live in `lib/server/notify.ts` (`renderTemplate`), so subject, in-app text and email body stay in one
place. Mandatory messages ignore the user's preferences; optional ones respect `/account/notifications`.

| Kind | Trigger | Mandatory | Contains a link? |
|---|---|---|---|
| `welcome` | Account created | no | in-app |
| `email_verification` | Registration (Supabase Auth) | yes | **yes — token** |
| `password_reset` | Forgot password (Supabase Auth) | yes | **yes — token** |
| `subscription_confirmed` | Verified payment activates a subscription | yes | account |
| `payment_receipt` | Verified successful payment | yes | payment history |
| `payment_failed` | Failed/pending expiry, failed renewal | yes | renewal page |
| `renewal_reminder` | Period ending (scheduled job in Wave 3) | no | renewal page |
| `subscription_cancelled` | Cancellation | yes | account |
| `creator_application_received` | Application submitted | no | `/creator/application-status` |
| `creator_application_decided` | Reviewer decision | yes | decision + reason |
| `episode_submitted` | Creator submits an episode | no | review queue |
| `episode_decided` | Reviewer approves/rejects | yes | decision + note |
| `episode_published` | Episode goes live | no | episode page |
| `security_event` | Password changed/reset, session revoked, account locked | yes | password reset page |

Every message also creates an in-app notification row. Notification bodies never contain a token; the mandatory
`email_verification` and `password_reset` kinds are explicitly barred from carrying a stored body.

---

## 3. Configuration variables (server-only)

| Variable | Required | Example | Notes |
|---|---|---|---|
| `SONARA_EMAIL_PROVIDER` | yes for Supabase mode | `smtp` \| `log` \| `none` | `log` records "logged" without sending; `none` records "suppressed". Unknown values refuse to start |
| `SMTP_HOST` | with `smtp` | `smtp.eu.mailgun.org` | Localhost is refused in production |
| `SMTP_PORT` | with `smtp` | `587` | `465` implies implicit TLS |
| `SMTP_SECURE` | no | `false` | `true` for port 465 |
| `SMTP_REQUIRE_TLS` | no | `true` | Defaults to true for any non-localhost host — STARTTLS is not optional |
| `SMTP_USER` | no | `postmaster@mg.example.org` | Omit for an unauthenticated relay |
| `SMTP_PASS` | no | — | **server-only; never commit, never paste in chat** |
| `EMAIL_FROM` | with `smtp` | `Sonara <no-reply@example.org>` | Must be an address the relay is authorised to send for |
| `SONARA_APP_URL` | yes | `https://sonara.example.org` | Absolute base for every link in every email |

`resolveEmailConfig` is pure and unit-tested (`lib/server/email-config.test.ts`, 7 assertions): provider inference
(`SMTP_HOST` present ⇒ `smtp`), sender validation, port validation, TLS defaults, and the production localhost
refusal.

---

## 4. Delivery, retries and the delivery log

- **Supabase mode.** `writeData` returns the emails produced by the transaction and `deliverEmails()` sends them
  **after commit**, so a rolled-back change never sends mail.
- **Retries.** Three immediate attempts with backoff (0 ms, 400 ms, 1.6 s). A final failure is recorded with
  `next_attempt_at`; the admin "Run billing jobs" action calls `retryFailedEmails()`.
- **Delivery log.** `public.email_deliveries` (0160): `to_email`, `kind`, `subject`, `provider`, `status`
  (`queued|sent|failed|suppressed|logged`), `attempts`, `last_error`, `next_attempt_at`, `sent_at`, `body`.
  A database check constraint forbids a body for `email_verification` and `password_reset`:
  ```sql
  constraint email_deliveries_no_auth_links check (
    kind not in ('email_verification', 'password_reset') or body is null
  );
  ```
- **Errors.** Only the error class, code and SMTP response code are stored (max 120 chars). SMTP errors can echo
  the message, so the raw error is never logged.
- **RLS.** Staff read the delivery log through their role; ordinary users cannot read it, and nobody can update it
  except the service-role retry path.

### What is never logged or stored

- Verification and reset **tokens or links** (no body, no log line).
- SMTP credentials, the Flutterwave secret or webhook hash.
- Full card or mobile-money details (never received).

---

## 5. Provider choices (owner decision)

Any SMTP relay works, because the transport is standard SMTP. Practical options for Uganda/East Africa:

| Provider | Pros | Cons |
|---|---|---|
| Resend | simple API + SMTP, good deliverability | needs domain DNS (SPF/DKIM) |
| Postmark | best transactional deliverability | paid tier for volume |
| Amazon SES | cheapest at scale | more setup (sandbox exit, IAM SMTP creds) |
| Mailgun | mature SMTP | deliverability tuning needed |
| Supabase's built-in SMTP | zero setup | **testing only** — hard rate limits, not for production |

Whichever is chosen, the sending domain needs SPF, DKIM and a DMARC policy before launch. That is a DNS change
and therefore outside this wave.

---

## 6. Local testing without sending mail

```bash
# 1. Development backend: the outbox is the mail client.
pnpm --filter @kito/web dev
# open http://127.0.0.1:3100/dev/outbox

# 2. Supabase backend without a provider: record instead of send.
SONARA_EMAIL_PROVIDER=log pnpm --filter @kito/web dev
psql "$SUPABASE_DB_URL" -c \
  "select kind, status, attempts, last_error, created_at from public.email_deliveries order by created_at desc limit 20;"

# 3. The configuration rules, without a network:
node --test --experimental-strip-types apps/web/lib/server/email-config.test.ts
```

A local Mailpit (Supabase CLI) also works: `SMTP_HOST=127.0.0.1`, `SMTP_PORT=55425`,
`SMTP_REQUIRE_TLS=false`, `NODE_ENV=development`.

---

## 7. What is still missing

- A chosen provider and credentials; domain authentication.
- A scheduled renewal-reminder job (the template exists; the cron does not).
- Bounce and complaint handling, and a suppression list.
- Staff notification for failed payments beyond the delivery log.
- Unsubscribe links for optional email (preferences exist; one-click unsubscribe header does not).
- Deliverability monitoring.

None of these blocks local development or the sandbox acceptance run. All of them block sending real mail to real
listeners.
