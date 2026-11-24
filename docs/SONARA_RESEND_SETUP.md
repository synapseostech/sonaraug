# Sonara — Resend and Email Setup

## Implementation status

Sonara currently implements **SMTP delivery only** through Nodemailer. It has no Resend SDK or API integration. Resend may be used through its SMTP credentials, or the implementation may be upgraded to the Resend API later.

## Product email

Set these variables when an approved SMTP relay is available:

```text
SONARA_EMAIL_PROVIDER=smtp
SMTP_HOST=<smtp-host>
SMTP_PORT=587
SMTP_SECURE=false
SMTP_REQUIRE_TLS=true
SMTP_USER=<smtp-login>
SMTP_PASS=<smtp-password>
EMAIL_FROM=Sonara <no-reply@<verified-domain>>
SONARA_APP_URL=https://<approved-domain>
```

Before launch, use `SONARA_EMAIL_PROVIDER=log` to suppress delivery while retaining delivery records. `none` suppresses and records no active delivery; `log` is safer for staging.

No real email should be sent during preview readiness work.

## Supabase Auth email

Supabase Auth sends registration verification and password recovery. Configure this separately in the Supabase dashboard:

1. Authentication → URL Configuration.
2. Set Site URL and Redirect URLs.
3. Authentication → SMTP Settings.
4. Configure the same verified domain or approved relay.
5. Configure sender name and address.
6. Update confirmation, recovery, email-change and password-change templates.

Supabase Auth SMTP is not controlled by `SMTP_PASS` or `SONARA_EMAIL_PROVIDER`.

## Resend SMTP option

Obtain SMTP credentials from the Resend dashboard and verify the sender domain. Configure:

- approved sender address as `EMAIL_FROM`
- Resend SMTP host
- Resend SMTP port
- SMTP login
- SMTP credential as `SMTP_PASS`

No Resend value should be stored in browser variables or source files.

## DNS

For the sending domain, verify and maintain:

- SPF
- DKIM
- DMARC
- bounce/complaint handling if supported
- return-path configuration supplied by the relay

## Verification

- Unit test email configuration.
- Register a staging user.
- Confirm verification email arrives from Supabase.
- Request password reset.
- Trigger only staged product emails.
- Confirm sensitive auth links are not stored in `email_deliveries.body`.
- Confirm SMTP failures are body-free and retried.
