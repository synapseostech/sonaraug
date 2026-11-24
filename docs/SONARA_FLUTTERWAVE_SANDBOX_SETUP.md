# Sonara — Flutterwave Sandbox Setup

Live payments remain disabled. This document describes test setup only.

## Test-only environment

```text
SONARA_PAYMENTS_MODE=flutterwave
FLW_ENVIRONMENT=test
FLW_PUBLIC_KEY=<sandbox-public-key>
FLW_SECRET_KEY=<sandbox-secret-key>
FLW_WEBHOOK_SECRET_HASH=<random-secret-hash-at-least-16-characters>
SONARA_APP_URL=https://<approved-staging-domain>
```

Do not set `FLW_LIVE_APPROVED=yes`. Do not set `SONARA_ALLOW_DEV_BACKEND=1`.

## Dashboard configuration

Set:

- Webhook URL: `${SONARA_APP_URL}/api/payments/flutterwave/webhook`
- Redirect URL: sent explicitly by checkout to `${SONARA_APP_URL}/api/payments/flutterwave/callback`
- Secret hash: exactly the value of `FLW_WEBHOOK_SECRET_HASH`
- Webhook retries: enabled
- Dashboard payment options: disabled if Sonara must validate an exact payment method

Flutterwave test keys must come from the sandbox/test section of the dashboard.

## Sandbox acceptance checks

Test these with fictitious accounts and sandbox numbers/cards:

1. Successful card payment.
2. Failed payment.
3. Pending payment.
4. Underpayment/mismatch.
5. Wrong currency.
6. Duplicate webhook.
7. Invalid `verif-hash`.
8. Recurring card plan.
9. Individual cancellation.
10. Failed renewal/grace period.
11. Manual renewal.
12. Reconciliation.

The browser redirect is not an entitlement grant. The callback and webhook re-verify server-side through the provider transaction API.

## Live activation remains blocked

Live activation requires all of:

- completed KYC
- owner approval
- `FLW_ENVIRONMENT=live`
- `FLW_LIVE_APPROVED=yes`
- super-admin database setting `billing.live_payments_enabled`
- approved live keys
- separate live webhook configuration
- explicit release sign-off
