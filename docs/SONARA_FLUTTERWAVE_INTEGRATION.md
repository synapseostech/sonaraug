# Flutterwave Integration

**Updated:** 2026-11-23 · **Status:** implemented against the documented v3 API and exercised end to end against Sonara's **local simulator**. **Not yet run against Flutterwave's sandbox**: no account or test keys were available. **Live payments are disabled** and need explicit owner approval and completed Flutterwave onboarding/KYC.

> **Wave 2 note.** The individual-subscription cancellation endpoint is confirmed as `PUT /v3/subscriptions/{id}/cancel`
> (distinct from `PUT /v3/payment-plans/{id}/cancel`, which cancels a whole plan and every subscriber). The adapter
> implements both, the simulator mirrors both, and cancellation webhooks are handled. Verification against the real
> sandbox is an owner action (test keys), listed as item 9 of §8.

## 1. Sources consulted (2026-11-23)

Read from developer.flutterwave.com: Webhooks; Transaction verification; Verify transaction (API reference); Flutterwave Standard (hosted checkout); Payment plans (recurring); Payment methods. The docs site is branded v4, but every endpoint shown is under `/v3/`. Not found or not confirmed in those pages: a `verify_by_reference` endpoint, any v4 webhook signature scheme, how test keys are distinguished or a separate sandbox base URL, and the exact method/path for cancelling a subscription.

## 2. What Sonara uses

| Capability | Endpoint / mechanism | Code |
|---|---|---|
| Hosted checkout | `POST /v3/payments` → `data.link` | `createHostedPayment` |
| Verification (source of truth) | `GET /v3/transactions/{id}/verify` | `verifyTransaction` |
| Recurring card plan | `POST /v3/payment-plans` (`monthly` / `yearly`) and `payment_plan` on checkout | `createPaymentPlan` |
| Cancel one subscription | `PUT /v3/subscriptions/{id}/cancel` — verified against the API reference (`/api/subscriptions/cancel-a-subscription-1`); cancels that subscription only, never the whole plan. **Not yet executed against the sandbox** | `cancelSubscription` |
| Webhook authenticity | `verif-hash` header equals the dashboard secret hash, compared in constant time | `verifyWebhookHash` |
| Payment options | `card, mobilemoneyuganda` for UGX one-off; `card` only for recurring | `paymentOptionsFor` |

All in `packages/billing/src/flutterwave.ts` (server-only subpath `@kito/billing/flutterwave`, uses `node:crypto`). The base URL is injectable, which is how the simulator runs the same code.

## 3. Flow

```
Listener ──(1) Checkout form──▶ Sonara server
  creates transaction {txRef SON-…, expected amount, currency, user, plan} status=initiated
  ──(2) POST /v3/payments──▶ Flutterwave ──data.link──▶ status=pending
Listener ──(3) pays on Flutterwave's page──▶ Flutterwave
Flutterwave ──(4) webhook charge.completed + verif-hash──▶ /api/payments/flutterwave/webhook
  a. hash check (401 on failure, recorded as rejected, no idempotency key)
  b. idempotency key event:data.id:data.status (duplicate → 200 "duplicate", no reprocessing)
  c. GET /v3/transactions/{data.id}/verify  ← never trusts the webhook body
  d. evaluateVerification: tx_ref equal, currency equal, amount ≥ expected, status successful
     successful → credit subscription once (idempotent per transaction), receipt, audit
     failed     → notify; renewal → past_due
     mismatch   → no access, flagged for finance (refund review)
  e. processing error → 500 so Flutterwave retries (enable retries in the dashboard)
Flutterwave ──(5) browser redirect ?status&tx_ref&transaction_id──▶ /api/payments/flutterwave/callback
  re-verifies transaction_id server-side (idempotent with 4) and shows the server's result;
  the `status` parameter is ignored
```

Statuses: `initiated → pending → successful | failed | mismatch`; `successful → reversed` only. A successful payment can never be turned into a failure; mismatch and reversed are final (enforced in TS and by DB trigger). Overpayment is accepted and flagged for a partial refund, as Flutterwave's guidance suggests.

## 4. Security properties

- Secret key and webhook hash are server-only environment variables; they are never sent to the browser, logged or written to the audit log (redaction of `*key*`, `*secret*`, `*hash*`, `*token*`, `*password*` fields). Client bundle scanned: no occurrences.
- Webhook signature check before parsing; a missing or short (< 16 chars) configured hash rejects everything.
- No IP allow-listing as a substitute for the hash (the docs do not publish stable IPs; hash + re-verification is the control).
- Replay: a replayed delivery hits the idempotency key; a forged one fails the hash; a replayed *callback* only re-runs verification.
- Provider transaction ids are unique per Sonara transaction (a provider id reused for a different `tx_ref` is refused and audited).
- No card numbers, CVVs, PINs or tokens are stored. Webhook payloads are stored as a summary without customer or card fields.
- Errors from Flutterwave are logged without request headers.

## 5. Recurring billing in Uganda

Per the payment-plans page, attaching a `payment_plan` fixes the method to **card**; mobile-money recurring is not documented. Sonara therefore offers:
- **Pay per period** (default): card or `mobilemoneyuganda`; reminders before expiry; `/subscribe/renewal`.
- **Automatic card renewal**: only when an administrator has created the Flutterwave plan for an approved (non-placeholder) price.
Flutterwave retries a failed recurring charge 3 more times at 30-minute intervals and cancels after three consecutive failures; Sonara receives the webhooks and applies grace.

## 6. Configuration

`.env.example` lists: `SONARA_PAYMENTS_MODE` (`simulator` | `flutterwave`), `FLW_ENVIRONMENT` (`test` | `live`), `FLW_LIVE_APPROVED`, `FLW_PUBLIC_KEY`, `FLW_SECRET_KEY`, `FLW_WEBHOOK_SECRET_HASH`, `FLW_API_BASE`, `SONARA_APP_URL`, `SONARA_SUPPORTED_CURRENCIES`. Live mode requires **all three**: `FLW_ENVIRONMENT=live`, `FLW_LIVE_APPROVED=yes`, and the super-admin-only setting "Allow live Flutterwave payments". Otherwise checkout reports "Payments are not configured".

Dashboard settings to make: webhook URL `${SONARA_APP_URL}/api/payments/flutterwave/webhook`; secret hash (≥ 16 random characters, same as `FLW_WEBHOOK_SECRET_HASH`); enable webhook retries; untick "Enable Dashboard Payment Options" so `payment_options` is honoured.

## 7. The local simulator (development only)

`/api/dev/flutterwave-sim/v3/{payments, transactions/{id}/verify, payment-plans, subscriptions/{id}/cancel}` and `/dev/flutterwave-sim/pay` stand in for Flutterwave with the documented request/response shapes, a bearer key, and a signed webhook. The pay page lets a tester choose success, failure, underpayment, wrong currency or abandonment, card or mobile money, and duplicate webhook delivery. It returns 404 unless the payment mode is `simulator`, which is never the case in production. **Simulated payments are labelled everywhere (checkout, receipt, payment history, admin) and never counted as revenue.**

## 8. Sandbox acceptance checklist (12 items — to run when test keys exist)

**None of these has been executed against Flutterwave.** The "simulator equivalent" column says what the local
simulator already exercises, so the difference between "tested in the simulator" and "tested in Flutterwave's
sandbox" stays explicit.

| # | Check | Expected result | Simulator equivalent | Sandbox status |
|---|---|---|---|---|
| 1 | Successful card payment | Checkout link → charge → webhook → server verification → subscription active → receipt | `/dev/flutterwave-sim/pay` outcome `success` + card | **Not run** |
| 2 | Failed payment | No entitlement, `failed` status, failure notice, retry offered | outcome `failure` | **Not run** |
| 3 | Pending payment | `pending`, no access, reconciled later; never treated as success | outcome `pending` | **Not run** |
| 4 | Incorrect amount (underpayment) | `mismatch`, no access, flagged for finance | outcome `underpay` | **Not run** |
| 5 | Incorrect currency | `mismatch`, no access | outcome `wrong_currency` | **Not run** |
| 6 | Duplicate webhook | Second delivery returns "duplicate", no second charge/credit | `duplicate` toggle | **Not run** |
| 7 | Invalid webhook signature | 401 before parsing, recorded as rejected, no state change | forged `verif-hash` (P-5) | **Not run** |
| 8 | Recurring payment | Card plan charges next period; renewal webhook applies; grace on failure | plan creation + simulated renewal | **Not run** (needs a real payment plan) |
| 9 | Individual subscription cancellation | `PUT /v3/subscriptions/{id}/cancel` returns success; `subscription.cancelled` handled; access continues to period end | simulator cancel route + webhook | **Not run** — this is the endpoint to confirm first |
| 10 | Payment failure after activation | `past_due`, grace window, reminder, then expiry — never immediate revocation | simulated failure on renewal | **Not run** |
| 11 | Renewal | Manual renewal works for mobile money; automatic only for card plans | `/subscribe/renewal` with a simulated payment | **Not run** |
| 12 | Reconciliation | Provider transaction list vs Sonara records: no orphan, no double credit, mismatches listed | admin reconciliation screen (P-8) | **Not run** |

Before running: set `SONARA_PAYMENTS_MODE=flutterwave`, `FLW_ENVIRONMENT=test`, the test secret/public keys and a
`FLW_WEBHOOK_SECRET_HASH` of ≥16 characters; expose the app (an approved tunnel or a staging URL) so Flutterwave
can reach `/api/payments/flutterwave/webhook`; enable webhook retries in the dashboard. Record every result in
`SONARA_WAVE_2_ACCEPTANCE.md` §6 before any live approval. Live mode additionally requires `FLW_LIVE_APPROVED=yes`,
the super-admin setting "Allow live Flutterwave payments", completed KYC and the owner's explicit sign-off.

Do not mark a transaction successful from the browser redirect: the callback re-verifies server-side and shows the
server's answer. Do not grant an entitlement before `GET /v3/transactions/{id}/verify` confirms reference, currency,
amount and status.
