# Subscriptions and Entitlements

**Updated:** 2026-11-23

## 1. Products

| Product | Unlocks | Requires | Does **not** grant |
|---|---|---|---|
| Free account | Free Medical Chronicles episodes (unless the platform requires sign-in), history, saved episodes | Registration | Premium listening |
| **Listener subscription** | Every premium Medical Chronicles episode | Verified email + verified payment (or audited grant) | Creator publishing |
| **Creator plan** | Publishing capacity within plan limits | **Approved creator application AND** an active creator plan with publishing | Premium listening; approval itself |

Prices: **no final prices exist.** Three development placeholder plans are seeded (Listener monthly UGX 10,000, Listener annual UGX 100,000, Creator starter UGX 30,000). Every customer-facing surface shows "Development price — not approved" while `priceIsPlaceholder` is set. Administrators set real prices at `/admin/subscriptions`.

## 2. Plans (admin-managed)

Fields: product (listener/creator, fixed after creation), code, name, description, interval (monthly/annual), price (integer; UGX has no minor unit), currency (UGX now; KES, TZS, RWF, USD supported by the money model for later), offered on/off, trial days (honoured only when trials are enabled in Settings; default off), features, display order, placeholder flag; creator limits (max shows, max episodes, upload allowance per period, storage, publishing, analytics level, promotion, support level). A price change detaches the Flutterwave recurring plan, which must be recreated.

Promotional codes: percentage (1–99%) or fixed amount, expiry, maximum redemptions, active flag. A code can never reduce a price to zero; complimentary access is an audited grant instead. Codes apply to pay-per-period checkout only.

## 3. Lifecycle

```
pending ──verified payment──▶ active ──period ends──▶ grace (N days) ──▶ expired
                               │  ▲                         │
                         cancel│  │verified renewal         │verified renewal
                               ▼  │                         ▼
                         cancelling (access to period end, no grace) ──▶ expired
```

- Access is computed from dates at read time (`effectiveState`), so expiry needs no job.
- **Grace period**: default 3 days after a missed renewal (Settings). Not applied after a cancellation or to trials.
- **Renewal**: paying early extends from the end of the current period; paying after lapse restarts from now. Crediting is idempotent per transaction (a duplicate webhook cannot double-extend).
- **Cancellation**: at period end, by the listener (`/account/subscriptions`, `/subscribe/cancel`); can be undone before the period ends. For card auto-renewal Sonara also calls Flutterwave's subscription cancel (endpoint unverified — see the Flutterwave document); if that call fails the listener is told and the event is audited.
- **Renewal modes**: *manual* (card or mobile money, pay each period; reminders at 7 and 1 days) and *card_auto* (Flutterwave payment plan; card only). Mobile money has no documented recurring mandate on Flutterwave, so it is always manual.
- **Failed renewal payment** marks the subscription *past_due*; grace still applies.
- **Billing jobs** (`/admin/subscriptions` → Run billing jobs, until a scheduler exists): renewal reminders and marking lapsed subscriptions expired. Access never depends on it.

## 4. Entitlement engine

`packages/billing/src/entitlements.ts` (pure, 25 tests), wired on the server in `apps/web/lib/server/entitlements.ts`, mirrored in SQL by `app_private.has_active_entitlement()`.

Precedence per product: active **suspension** override → no access; live **subscription** (including grace, excluding post-cancellation) → access; active **grant** override → access; otherwise none. Records of the other product are ignored.

Creator: `canPublish = approvedApplication && activeCreatorPlan && plan.creatorLimits.canPublish`; `withinCreatorLimit()` checks show, episode, upload and storage limits.

## 5. Administrative overrides

`/admin/subscriptions` → Manual entitlement adjustment (finance, admin, super admin): grant or suspend, listener or creator (creator grants name the plan whose limits apply), optional end date, **required reason**. Rules: nobody adjusts their own entitlements; overrides are revocable with a reason; every change is audited. Overrides are the *only* manual correction — there is no way to mark a transaction as paid.

## 6. Pages

`/subscribe` (both products, clearly separated) · `/subscribe/listener` (plans, current status) · `/subscribe/checkout` (summary, renewal mode, promo code, terms; requires sign-in and a verified email) · `/subscribe/success` (shows the **server's** verified record; "confirming" if still pending) · `/subscribe/failed` (failed / mismatch / abandoned / pending explanations) · `/subscribe/manage` · `/subscribe/cancel` · `/subscribe/renewal` · `/account/subscriptions` · `/account/billing` · `/account/payment-history` (with refund requests).

## 7. Open decisions

Final prices and intervals; whether to offer trials; tax treatment (VAT registration, tax-inclusive display) — **needs a qualified Ugandan tax adviser**; refund policy wording; institutional/educational group subscriptions (the entitlement model supports adding an organisation-scoped grant; not built).
