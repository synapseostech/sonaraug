# Accounts and Authentication

**Updated:** 2026-11-23 · **Status:** two implementations behind one facade (`apps/web/lib/server/auth.ts`):
a **development adapter** (scrypt + hashed session cookie) used by default outside production, and a **Supabase Auth
adapter** (`apps/web/lib/server/sb/auth.ts`) that becomes the default in production and is selected explicitly with
`SONARA_BACKEND=supabase`. The dedicated Sonara project does not exist yet (D-2); the healthcare project must never
be used. Pages and actions call only the facade, so the UI is identical on both.

Which implementation runs is decided once per process by `lib/server/backend-config.ts` **fail-closed**: production
without Supabase configuration refuses to serve, and `SONARA_BACKEND=dev` is refused in production unless
`SONARA_ALLOW_DEV_BACKEND=1` (local smoke tests only). The dev backend cannot become a silent production fallback.

## 1. Pages

Public: `/auth/register`, `/auth/login`, `/auth/verify-email`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/callback` (reserved for OAuth; says plainly that Google sign-in is not enabled), `/auth/complete-profile`.

Private (server-checked in the layout and again in each page/action): `/account` (overview, sign out), `/account/profile`, `/security` (change password), `/subscriptions`, `/billing`, `/payment-history` (refund requests), `/listening-history`, `/saved`, `/preferences`, `/notifications` (inbox + email preferences), `/devices` (sessions, sign out one or all others), `/privacy` (consent record, **download my data** as JSON), `/delete-account`.

## 2. Behaviour

| Concern | Implementation |
|---|---|
| Passwords | scrypt (N=2^15, r=8, p=1, 64-byte key, per-user salt); ≥ 10 characters, not common, not the email, not repetitive |
| Sessions | 32-byte random token in an `HttpOnly`, `SameSite=Lax` cookie (`Secure` when `SONARA_APP_URL` is https); only its SHA-256 is stored; 30-day expiry; last-seen updated at most every 10 minutes |
| Verification | Single-use, 24 h token (hash stored); the link opens a page with a **Confirm** button so email scanners cannot consume it; verification required to subscribe or apply as a creator, not to listen |
| Password reset | Generic response whether or not the account exists; single-use 1 h token; newest token invalidates older ones; reset signs out every device and sends a security notice |
| Brute force | 5 failed passwords → 15-minute account lock + security notice; 20 attempts per email per 15 min throttle; unknown emails cost the same scrypt time |
| Enumeration | Registration of an existing email and reset requests give non-committal messages |
| Open redirects | `next` accepts only same-site relative paths (not `//`, not `/\`, not `/auth/*`) |
| CSRF | Server actions: Next.js origin check. Cookie-authenticated route handlers (`playback`, `progress`, `save`, `upload`) require a same-origin `Origin` header |
| Account status | Suspended accounts cannot sign in and their sessions are dropped; deletion requests sign out everywhere and are recorded for a staff erasure process |
| Privacy | Account pages never render another user's data; export returns only the caller's records |

## 3. Email

Templates exist for: welcome, verification, password reset, subscription confirmation, payment receipt, payment failure, renewal reminder, cancellation, creator application received/decided, episode submitted/decided/published, security events. Mandatory messages (verification, reset, receipts, payment problems, cancellation, security) ignore preferences; others can be switched off in `/account/notifications`.

**Delivery:** development builds write emails to an on-server **outbox** at `/dev/outbox` (404 in production). No production provider is integrated; choosing one (SMTP, Resend, Postmark, SES…) and its credentials is an open decision.

## 4. Supabase Auth adapter (Wave 2)

| Concern | Implementation |
|---|---|
| Client | `@supabase/ssr` (cookie-based, server components) via `lib/server/sb/supabase.ts`; a request-scoped client for pages, a stateless client for route handlers |
| Verification of identity | `supabase.auth.getUser()` on every request — a call to the Auth server that also rejects revoked sessions; never `getSession()` alone (cookie contents are not proof) |
| Registration | `signUp` with email confirmation on; the display name is the only metadata read, and the database trims/limits it |
| Email verification | Handled by Supabase's confirmation link; the app shows the state and lets the user resend through Supabase's rate limits |
| Login | `signInWithPassword`; the facade adds account-status checks (`profiles.status = 'active'`), audit, notifications and Sonara's rate-limit buckets on top of Supabase's own per-IP limits |
| Logout | `signOut` revokes the Auth session; dev backend hashes-and-deletes its session row |
| Password reset | `resetPasswordForEmail` → Supabase link → `/auth/reset-password`; the new password is set through Supabase; other sessions are invalidated by the Auth server, and Sonara records a security event |
| Session refresh | `@supabase/ssr` refresh in middleware/route handlers; the access token is short-lived and the refresh token rotates |
| Protected routes | Each page/action/layout re-checks the viewer server-side. A layout guard alone is not treated as sufficient |
| Profile sync | `profiles.id = auth.users.id`; `0160 handle_new_user` creates the profile on signup (email, display name, terms versions) and never reads a role from metadata |
| Roles | Rows in `platform_roles`, written only by `grant_platform_role`/`revoke_platform_role` (audited, self-change refused, last super admin protected). `{"role":"super_admin"}` in user metadata grants nothing |
| Account status | Suspended accounts: no session is honoured (`getViewer` returns null), the Auth user is banned by the processor, and every page redirects to sign-in |
| Error states | Wrong password, unverified email, suspended account, expired link, rate limited and backend-not-configured each render a distinct message; no error reveals whether an account exists |

Journeys proven against the **development** adapter end to end in a production build: register → verify → login →
reset (single use, other sessions revoked) → protected routes → role grant → self-role-change refused. The same
journeys against a **hosted** Supabase project are in the Wave 2 acceptance checklist and **have not been run**
(no project). `11_wave2_backend` proves the database half: signup provisioning, no role from metadata, session
listing/revocation, terms acceptance and deletion requests.

## 5. Gaps before production

- Run the auth journeys against the real project (D-2): everything above is verified against a local adapter and a
  local Postgres schema, not a hosted Auth server.
- Transactional email provider, SPF/DKIM/DMARC for the sending domain (see SONARA_EMAIL_CONFIGURATION.md).
- Google sign-in (planned via Supabase; `/auth/callback` reserved).
- Staff MFA; change-email flow with re-verification; account-erasure job and retention schedule.
- Turnstile/CAPTCHA on registration (the distributed limiter exists; see F-15/N-6).
- MFA for staff, and a change-email flow with re-verification against Supabase's secure email change.
