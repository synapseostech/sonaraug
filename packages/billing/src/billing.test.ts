import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addInterval,
  applyPromo,
  applySuccessfulPayment,
  cancelAtPeriodEnd,
  creatorEntitlement,
  effectiveState,
  evaluateVerification,
  formatMoney,
  fromMajorUnits,
  listenerEntitlement,
  reconcile,
  resumeSubscription,
  startTrial,
  toMajorUnits,
  validatePlan,
  canMoveTransaction,
  type EntitlementOverride,
  type PaymentTransaction,
  type Plan,
  type Subscription,
} from "./index.ts";
import {
  createHostedPayment,
  parseWebhook,
  paymentOptionsFor,
  verifyTransaction,
  verifyWebhookHash,
  webhookIdempotencyKey,
  FlutterwaveError,
} from "./flutterwave.ts";

const NOW = new Date("2026-11-23T12:00:00Z");
const GRACE = 3;

const listenerPlan: Plan = {
  id: "plan_listener_monthly",
  audience: "listener",
  code: "listener-monthly",
  name: "Listener monthly",
  description: "",
  interval: "monthly",
  amount: 10000,
  currency: "UGX",
  active: true,
  trialDays: 7,
  features: [],
  creatorLimits: null,
  providerPlanId: null,
  priceIsPlaceholder: true,
  sortOrder: 1,
};
const creatorPlan: Plan = {
  ...listenerPlan,
  id: "plan_creator",
  audience: "creator",
  code: "creator-basic",
  creatorLimits: { maxShows: 1, maxEpisodes: 10, uploadAllowanceMb: 500, storageMb: 2000, canPublish: true, analytics: "basic", promotion: false, supportLevel: "standard" },
};

function sub(extra: Partial<Subscription> = {}): Subscription {
  return {
    id: "sub1",
    userId: "u1",
    planId: listenerPlan.id,
    audience: "listener",
    status: "active",
    currentPeriodStart: "2026-11-01T00:00:00Z",
    currentPeriodEnd: "2026-12-01T00:00:00Z",
    cancelAtPeriodEnd: false,
    cancelledAt: null,
    renewalMode: "manual",
    providerSubscriptionId: null,
    isTrial: false,
    appliedTransactionIds: ["tx1"],
    createdAt: "2026-11-01T00:00:00Z",
    updatedAt: "2026-11-01T00:00:00Z",
    ...extra,
  };
}

const none = { subscriptions: [] as Subscription[], overrides: [] as EntitlementOverride[] };

/* ---------------------------------------------------------------- money */

test("UGX is integer shillings; conversions to provider decimals are exact", () => {
  assert.equal(toMajorUnits({ amount: 15000, currency: "UGX" }), 15000);
  assert.equal(toMajorUnits({ amount: 1999, currency: "KES" }), 19.99);
  assert.equal(fromMajorUnits(19.99, "KES"), 1999);
  assert.throws(() => toMajorUnits({ amount: 10.5, currency: "UGX" }));
  assert.throws(() => toMajorUnits({ amount: 100, currency: "XXX" }));
  assert.match(formatMoney({ amount: 15000, currency: "UGX" }), /15,000/);
});

test("plans are validated; listener plans cannot carry creator limits and vice versa", () => {
  assert.deepEqual(validatePlan(listenerPlan), []);
  assert.ok(validatePlan({ ...listenerPlan, amount: 0 }).includes("amount_invalid"));
  assert.ok(validatePlan({ ...listenerPlan, creatorLimits: creatorPlan.creatorLimits }).includes("limits_forbidden"));
  assert.ok(validatePlan({ ...creatorPlan, creatorLimits: null }).includes("limits_required"));
  assert.ok(validatePlan({ ...listenerPlan, code: "Bad Code" }).includes("code_invalid"));
});

test("billing intervals are calendar-safe", () => {
  assert.equal(addInterval("2026-01-31T10:00:00.000Z", "monthly"), "2026-02-28T10:00:00.000Z");
  assert.equal(addInterval("2028-01-31T10:00:00.000Z", "monthly"), "2028-02-29T10:00:00.000Z");
  assert.equal(addInterval("2026-03-15T00:00:00.000Z", "annual"), "2027-03-15T00:00:00.000Z");
});

/* ---------------------------------------------------------------- promo */

test("promotional codes discount but never make a plan free", () => {
  const promo = { id: "p", code: "LAUNCH", description: "", percentOff: 20, amountOff: null, currency: null, planIds: null, validFrom: null, validUntil: null, maxRedemptions: 10, redemptions: 0, active: true };
  assert.deepEqual(applyPromo(listenerPlan, promo, NOW), { ok: true, amount: 8000, discount: 2000 });
  assert.equal(applyPromo(listenerPlan, { ...promo, percentOff: 100 }, NOW).ok, false);
  assert.equal(applyPromo(listenerPlan, { ...promo, redemptions: 10 }, NOW).ok, false);
  assert.equal(applyPromo(listenerPlan, { ...promo, validUntil: "2026-01-01T00:00:00Z" }, NOW).ok, false);
  assert.equal(applyPromo(listenerPlan, { ...promo, planIds: ["other"] }, NOW).ok, false);
  assert.equal(applyPromo(listenerPlan, { ...promo, percentOff: null, amountOff: 100, currency: "KES" }, NOW).ok, false);
});

/* -------------------------------------------------------- subscriptions */

test("P-1 a pending subscription grants nothing", () => {
  const pending = sub({ status: "pending", currentPeriodStart: null, currentPeriodEnd: null, appliedTransactionIds: [] });
  assert.equal(effectiveState(pending, NOW, GRACE).grantsAccess, false);
  assert.equal(listenerEntitlement("u1", { subscriptions: [pending], overrides: [] }, NOW, GRACE).premium, false);
});

test("L-7 an expired subscription stops granting access after the grace period", () => {
  const ended = sub({ currentPeriodEnd: "2026-11-22T00:00:00Z" });
  assert.equal(effectiveState(ended, NOW, GRACE).state, "grace");
  assert.equal(listenerEntitlement("u1", { subscriptions: [ended], overrides: [] }, NOW, GRACE).premium, true);
  assert.equal(effectiveState(ended, NOW, 0).state, "expired", "no grace configured");
  const longGone = sub({ currentPeriodEnd: "2026-11-10T00:00:00Z" });
  assert.equal(effectiveState(longGone, NOW, GRACE).state, "expired");
  assert.equal(listenerEntitlement("u1", { subscriptions: [longGone], overrides: [] }, NOW, GRACE).premium, false);
});

test("P-7 / L-8 cancellation keeps access to the end of the paid period, without grace", () => {
  const result = cancelAtPeriodEnd(sub(), NOW, GRACE);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(effectiveState(result.subscription, NOW, GRACE).state, "cancelling");
  assert.equal(effectiveState(result.subscription, new Date("2026-12-01T00:00:01Z"), GRACE).state, "expired");
  assert.equal(cancelAtPeriodEnd(result.subscription, NOW, GRACE).ok, false, "cannot cancel twice");
  const resumed = resumeSubscription(result.subscription, NOW);
  assert.equal(resumed.ok && resumed.subscription.cancelAtPeriodEnd, false);
});

test("P-2 a verified payment activates the right subscription for the right period", () => {
  const result = applySuccessfulPayment({ existing: null, plan: listenerPlan, userId: "u1", transactionId: "txA", newSubscriptionId: "subA", renewalMode: "manual", now: NOW });
  assert.equal(result.applied, true);
  assert.equal(result.subscription.status, "active");
  assert.equal(result.subscription.currentPeriodEnd, "2026-12-23T12:00:00.000Z");
  assert.equal(listenerEntitlement("u1", { subscriptions: [result.subscription], overrides: [] }, NOW, GRACE).premium, true);
});

test("P-4 applying the same transaction twice changes nothing", () => {
  const first = applySuccessfulPayment({ existing: null, plan: listenerPlan, userId: "u1", transactionId: "txA", newSubscriptionId: "subA", renewalMode: "manual", now: NOW });
  const again = applySuccessfulPayment({ existing: first.subscription, plan: listenerPlan, userId: "u1", transactionId: "txA", newSubscriptionId: "subB", renewalMode: "manual", now: NOW });
  assert.equal(again.applied, false);
  assert.deepEqual(again.subscription, first.subscription);
});

test("an early renewal extends from the end of the paid period; a lapsed one restarts now", () => {
  const early = applySuccessfulPayment({ existing: sub(), plan: listenerPlan, userId: "u1", transactionId: "tx2", newSubscriptionId: "x", renewalMode: "manual", now: NOW });
  assert.equal(early.renewal, true);
  assert.equal(early.subscription.currentPeriodStart, "2026-12-01T00:00:00Z");
  assert.equal(early.subscription.currentPeriodEnd, "2027-01-01T00:00:00.000Z");
  const lapsed = applySuccessfulPayment({ existing: sub({ currentPeriodEnd: "2026-10-01T00:00:00Z" }), plan: listenerPlan, userId: "u1", transactionId: "tx3", newSubscriptionId: "x", renewalMode: "manual", now: NOW });
  assert.equal(lapsed.subscription.currentPeriodStart, NOW.toISOString());
});

test("a payment cannot be credited to another user's subscription", () => {
  assert.throws(() => applySuccessfulPayment({ existing: sub({ userId: "u2" }), plan: listenerPlan, userId: "u1", transactionId: "t", newSubscriptionId: "x", renewalMode: "manual", now: NOW }));
});

test("trials need the platform switch, plan trial days and no previous subscription", () => {
  const base = { plan: listenerPlan, userId: "u1", subscriptionId: "t1", now: NOW };
  assert.equal(startTrial({ ...base, history: [], trialsEnabled: false }).ok, false);
  const ok = startTrial({ ...base, history: [], trialsEnabled: true });
  assert.equal(ok.ok && effectiveState(ok.subscription, NOW, GRACE).state, "trial");
  assert.equal(startTrial({ ...base, history: [sub()], trialsEnabled: true }).ok, false);
});

/* --------------------------------------------------------- entitlements */

const grant = (extra: Partial<EntitlementOverride> = {}): EntitlementOverride => ({
  id: "o1",
  userId: "u1",
  audience: "listener",
  effect: "grant",
  planId: null,
  validFrom: "2026-11-01T00:00:00Z",
  validUntil: null,
  reason: "Faculty partner",
  createdBy: "admin",
  createdAt: "2026-11-01T00:00:00Z",
  revokedAt: null,
  revokedBy: null,
  ...extra,
});

test("audited overrides grant and revoke; revoke wins; expired overrides do nothing", () => {
  assert.equal(listenerEntitlement("u1", { subscriptions: [], overrides: [grant()] }, NOW, GRACE).source, "override");
  assert.equal(listenerEntitlement("u1", { subscriptions: [sub()], overrides: [grant({ effect: "revoke" })] }, NOW, GRACE).premium, false);
  assert.equal(listenerEntitlement("u1", { subscriptions: [], overrides: [grant({ validUntil: "2026-11-20T00:00:00Z" })] }, NOW, GRACE).premium, false);
  assert.equal(listenerEntitlement("u1", { subscriptions: [], overrides: [grant({ revokedAt: "2026-11-22T00:00:00Z" })] }, NOW, GRACE).premium, false);
  assert.equal(listenerEntitlement("u2", { subscriptions: [sub()], overrides: [grant()] }, NOW, GRACE).premium, false, "other users' records never count");
});

test("listener and creator entitlements are independent products", () => {
  const creatorSub = sub({ id: "c1", planId: creatorPlan.id, audience: "creator" });
  const records = { subscriptions: [creatorSub], overrides: [], plans: [listenerPlan, creatorPlan] };
  assert.equal(listenerEntitlement("u1", records, NOW, GRACE).premium, false, "creator plan does not unlock premium listening");
  const listenerOnly = { subscriptions: [sub()], overrides: [], plans: [listenerPlan, creatorPlan] };
  assert.equal(creatorEntitlement("u1", listenerOnly, true, NOW, GRACE).canPublish, false, "listener plan does not grant publishing");
});

test("C-3 / C-4 publishing needs both creator approval and a paid creator plan", () => {
  const records = { subscriptions: [sub({ planId: creatorPlan.id, audience: "creator" })], overrides: [], plans: [creatorPlan] };
  assert.equal(creatorEntitlement("u1", { ...none, plans: [creatorPlan] }, true, NOW, GRACE).reason, "no_plan");
  assert.equal(creatorEntitlement("u1", records, false, NOW, GRACE).reason, "not_approved", "paying does not approve");
  const ok = creatorEntitlement("u1", records, true, NOW, GRACE);
  assert.equal(ok.canPublish, true);
  assert.equal(ok.limits?.maxShows, 1);
});

/* ------------------------------------------------------ verification */

const expected = { txRef: "SON-ABC", amount: 10000, currency: "UGX" };
const verified = { id: "285959875", txRef: "SON-ABC", providerRef: "FLW-1", status: "successful", amount: 10000, chargedAmount: 10000, currency: "UGX", paymentType: "mobilemoneyuganda", customerEmail: "a@b.c" };

test("P-2 a matching verified transaction is successful", () => {
  assert.deepEqual(evaluateVerification(expected, verified).status, "successful");
});

test("P-6 amount, currency or reference mismatches are rejected", () => {
  assert.equal(evaluateVerification(expected, { ...verified, amount: 9999 }).status, "mismatch");
  assert.equal(evaluateVerification(expected, { ...verified, currency: "KES" }).status, "mismatch");
  assert.equal(evaluateVerification(expected, { ...verified, txRef: "SON-OTHER" }).status, "mismatch");
  const over = evaluateVerification(expected, { ...verified, amount: 12000 });
  assert.equal(over.status, "successful");
  assert.equal(over.overpaid, true, "overpayment is flagged for refund review");
});

test("P-1 / P-3 pending and failed provider states never succeed", () => {
  assert.equal(evaluateVerification(expected, { ...verified, status: "pending" }).status, "pending");
  assert.equal(evaluateVerification(expected, { ...verified, status: "failed" }).status, "failed");
  assert.equal(evaluateVerification(expected, { ...verified, status: "weird" }).status, "pending");
});

test("transaction status moves are one-way: success can only be reversed", () => {
  assert.equal(canMoveTransaction("pending", "successful"), true);
  assert.equal(canMoveTransaction("successful", "failed"), false);
  assert.equal(canMoveTransaction("successful", "reversed"), true);
  assert.equal(canMoveTransaction("mismatch", "successful"), false);
});

/* ------------------------------------------------------- reconciliation */

function tx(extra: Partial<PaymentTransaction> = {}): PaymentTransaction {
  return {
    id: "tx1", txRef: "SON-1", userId: "u1", planId: listenerPlan.id, audience: "listener", purpose: "new", amount: 10000, currency: "UGX",
    promoCodeId: null, status: "successful", provider: "flutterwave", environment: "simulator", providerTransactionId: "1", providerRef: null,
    paymentType: null, chargedAmount: 10000, overpaid: false, failureReason: null, verifiedAt: NOW.toISOString(), subscriptionId: "sub1",
    refundStatus: "none", createdAt: "2026-11-01T00:00:00Z", updatedAt: "2026-11-01T00:00:00Z", ...extra,
  };
}

test("P-8 reconciliation finds inconsistent records", () => {
  const issues = reconcile({
    transactions: [tx(), tx({ id: "tx2", txRef: "SON-2", status: "pending" }), tx({ id: "tx3", txRef: "SON-3" }), tx({ id: "tx4", txRef: "SON-4", status: "mismatch", failureReason: "amount too low" })],
    subscriptions: [sub(), sub({ id: "sub2", userId: "u9", appliedTransactionIds: [] })],
    overrides: [],
    now: NOW,
    graceDays: GRACE,
  });
  const kinds = issues.map((i) => i.kind).sort();
  assert.deepEqual(kinds, ["access_without_payment", "amount_or_currency_mismatch", "stale_pending", "successful_not_applied"]);
  const clean = reconcile({ transactions: [tx()], subscriptions: [sub()], overrides: [], now: NOW, graceDays: GRACE });
  assert.deepEqual(clean, []);
});

/* ---------------------------------------------------------- flutterwave */

test("P-5 forged webhooks are rejected: wrong, missing or empty hash, or no secret configured", () => {
  const secret = "a-long-dashboard-secret-hash-value";
  assert.equal(verifyWebhookHash(secret, secret), true);
  assert.equal(verifyWebhookHash("guess", secret), false);
  assert.equal(verifyWebhookHash(`${secret}x`, secret), false);
  assert.equal(verifyWebhookHash(null, secret), false);
  assert.equal(verifyWebhookHash("", secret), false);
  assert.equal(verifyWebhookHash("anything", ""), false, "an unset secret rejects everything");
  assert.equal(verifyWebhookHash("short", "short"), false, "a trivial secret is refused");
});

test("webhook bodies are parsed defensively and keyed for idempotency", () => {
  const body = JSON.stringify({ event: "charge.completed", data: { id: 285959875, tx_ref: "SON-ABC", status: "successful", amount: 10000, currency: "UGX", customer: { email: "a@b.c" } } });
  const event = parseWebhook(body);
  assert.ok(event);
  assert.equal(webhookIdempotencyKey(event!), "charge.completed:285959875:successful");
  assert.equal(parseWebhook("not json"), null);
  assert.equal(parseWebhook(JSON.stringify({ data: {} })), null);
  assert.equal(parseWebhook(JSON.stringify({ "event.type": "CARD_TRANSACTION", data: { id: 1 } }))?.event, "CARD_TRANSACTION");
});

test("hosted checkout sends documented fields and decimal amounts; secrets never reach error messages", async () => {
  let sent: { url: string; init: RequestInit } | null = null;
  const fakeFetch = (async (url: string, init: RequestInit) => {
    sent = { url, init };
    return new Response(JSON.stringify({ status: "success", message: "Hosted Link", data: { link: "https://checkout.flutterwave.com/v3/hosted/pay/x" } }), { status: 200 });
  }) as unknown as typeof fetch;
  const config = { secretKey: "SECRET-KEY-VALUE", baseUrl: "https://api.flutterwave.com", fetch: fakeFetch };
  const { link } = await createHostedPayment(config, {
    txRef: "SON-ABC", amount: 10000, currency: "UGX", redirectUrl: "http://127.0.0.1:3100/api/payments/flutterwave/callback",
    customer: { email: "a@b.c", name: "A" }, title: "Sonara", description: "Listener monthly", paymentOptions: paymentOptionsFor("UGX", false),
  });
  assert.equal(link, "https://checkout.flutterwave.com/v3/hosted/pay/x");
  assert.ok(sent);
  const s = sent as unknown as { url: string; init: RequestInit };
  assert.equal(s.url, "https://api.flutterwave.com/v3/payments");
  const body = JSON.parse(String(s.init.body));
  assert.equal(body.tx_ref, "SON-ABC");
  assert.equal(body.amount, 10000);
  assert.equal(body.payment_options, "card, mobilemoneyuganda");
  assert.equal(body.payment_plan, undefined);

  const failing = (async () => new Response(JSON.stringify({ status: "error", message: "Invalid authorization key" }), { status: 401 })) as unknown as typeof fetch;
  await assert.rejects(
    () => verifyTransaction({ ...config, fetch: failing }, "123"),
    (error: unknown) => error instanceof FlutterwaveError && !String((error as Error).message).includes("SECRET-KEY-VALUE"),
  );
});

test("verification requires a numeric provider id and complete response fields", async () => {
  const config = { secretKey: "k", baseUrl: "https://api.flutterwave.com" };
  await assert.rejects(() => verifyTransaction(config, "../../v3/transfers"));
  const partial = (async () => new Response(JSON.stringify({ status: "success", data: { id: 1, status: "successful" } }), { status: 200 })) as unknown as typeof fetch;
  await assert.rejects(() => verifyTransaction({ ...config, fetch: partial }, "1"));
});

test("recurring checkout is card-only; one-off UGX checkout offers mobile money", () => {
  assert.equal(paymentOptionsFor("UGX", true), "card");
  assert.equal(paymentOptionsFor("UGX", false), "card, mobilemoneyuganda");
});
