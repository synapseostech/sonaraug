/**
 * Billing service: plans, checkout, verification, webhooks, lifecycle, refunds,
 * overrides and reconciliation.
 *
 * Invariants:
 *  - Access changes only after `confirmTransaction` re-verifies with the provider
 *    and @kito/billing's evaluateVerification() returns "successful".
 *  - Crediting a subscription is idempotent per internal transaction id.
 *  - There is no function that marks a transaction paid by hand. Manual access
 *    corrections are entitlement overrides: separate, reasoned, audited.
 */
import {
  addDays,
  applyPromo,
  applySuccessfulPayment,
  cancelAtPeriodEnd,
  canMoveTransaction,
  daysUntil,
  effectiveState,
  evaluateVerification,
  formatMoney,
  markPaymentFailed,
  matchRecurringCharge,
  newTxRef,
  normalisePromoCode,
  reconcile,
  resumeSubscription,
  validatePlan,
  type EntitlementOverride,
  type PaymentTransaction,
  type Plan,
  type PlanAudience,
  type PromoCode,
  type Subscription,
} from "@kito/billing";
import {
  cancelSubscription as providerCancel,
  createHostedPayment,
  listSubscriptions,
  createPaymentPlan,
  FlutterwaveError,
  parseWebhook,
  paymentOptionsFor,
  verifyTransaction,
  verifyWebhookHash,
  webhookIdempotencyKey,
} from "@kito/billing/flutterwave";
import { staffCan } from "@kito/auth";
import { brand } from "@kito/config";
import type { Viewer } from "./auth.ts";
import { appendAudit } from "./audit.ts";
import { requestId } from "./request.ts";
import { randomHex, randomId } from "./crypto.ts";
import { CommandError } from "./chronicles.ts";
import { appUrl, notify } from "./notify.ts";
import { environmentOf, flutterwaveConfig, paymentMode, webhookSecretHash } from "./payments-config.ts";
import { asService, asViewer, isSupabase, readData, scope, where, whereSystem, writeData } from "./data.ts";
import { retryFailedEmails } from "./email.ts";
import type { DataShape, RefundRequest, WebhookEventRecord } from "./types.ts";

const actorOf = (viewer: Viewer) => ({ id: viewer.id, roles: viewer.roles });
const money = (amount: number, currency: string) => formatMoney({ amount, currency });

/* --------------------------------------------------------------------- reads */

export async function activePlans(audience: PlanAudience): Promise<Plan[]> {
  const data = await readData(scope({ as: "anon" }, { plans: where("t.is_active") }));
  return data.plans.filter((p) => p.audience === audience && p.active).sort((a, b) => a.sortOrder - b.sortOrder);
}

const own = (viewer: Viewer) => where("t.profile_id = $1", viewer.id);

export async function billingOverviewFor(viewer: Viewer) {
  const data = await readData(
    scope(asViewer(viewer), { subscriptions: own(viewer), transactions: own(viewer), refunds: where("t.requested_by = $1", viewer.id), overrides: own(viewer), plans: true }),
  );
  return billingOverviewForFrom(data, viewer.id);
}

export function billingOverviewForFrom(data: Readonly<DataShape>, userId: string) {
  const now = new Date();
  const subscriptions = data.subscriptions
    .filter((s) => s.userId === userId)
    .map((s) => ({ subscription: s, plan: data.plans.find((p) => p.id === s.planId) ?? null, effective: effectiveState(s, now, data.settings.graceDays) }))
    .sort((a, b) => b.subscription.createdAt.localeCompare(a.subscription.createdAt));
  const transactions = data.transactions.filter((t) => t.userId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const refunds = data.refunds.filter((r) => r.requestedBy === userId);
  const overrides = data.overrides.filter((o) => o.userId === userId);
  return { subscriptions, transactions, refunds, overrides, plans: data.plans, settings: data.settings };
}

/* ------------------------------------------------------------------ checkout */

export type CheckoutResult = { ok: true; redirectTo: string } | { ok: false; message: string };

export async function startCheckout(viewer: Viewer, input: { planId: string; promoCode: string; renewal: "manual" | "card_auto" }): Promise<CheckoutResult> {
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(input.planId)) return { ok: false, message: "That plan is not available." };
  // Checkout is the payment processor acting for the signed-in viewer: it reads the
  // viewer's own records and the plan/promotion, which listeners cannot select themselves.
  const data = await readData(
    scope(asService("checkout"), {
      plans: where("t.id::text = $1", input.planId),
      promos: where("t.code = $1", normalisePromoCode(input.promoCode) || "-"),
      creatorApplications: own(viewer),
      subscriptions: own(viewer),
      users: where("t.id = $1", viewer.id),
    }),
  );
  if (data.settings.maintenanceMode) return { ok: false, message: "Checkout is paused for maintenance. Please try again later." };
  if (!viewer.emailVerified) return { ok: false, message: "Verify your email address before subscribing. Check your inbox, or resend the link from your account." };
  const plan = data.plans.find((p) => p.id === input.planId && p.active);
  if (!plan) return { ok: false, message: "That plan is not available." };
  if (plan.audience === "creator" && !data.creatorApplications.some((a) => a.userId === viewer.id && a.status !== "withdrawn" && a.status !== "rejected")) {
    return { ok: false, message: "Apply to become a creator before choosing a creator plan." };
  }
  const mode = paymentMode(data.settings);
  const config = flutterwaveConfig(mode);
  if (!config) return { ok: false, message: "Payments are not configured on this deployment yet. No payment was attempted." };

  let amount = plan.amount;
  let promo: PromoCode | null = null;
  if (input.promoCode.trim()) {
    promo = data.promos.find((p) => p.code === normalisePromoCode(input.promoCode)) ?? null;
    const applied = applyPromo(plan, promo, new Date());
    if (!applied.ok) return { ok: false, message: applied.message };
    amount = applied.amount;
  }
  const recurring = input.renewal === "card_auto";
  if (recurring && !plan.providerPlanId) return { ok: false, message: "Automatic card renewal is not set up for this plan yet. Choose pay-per-period." };
  if (recurring && promo) return { ok: false, message: "Promotional codes apply to pay-per-period checkout only." };

  const live = data.subscriptions.find((s) => s.userId === viewer.id && s.audience === plan.audience && effectiveState(s, new Date(), data.settings.graceDays).grantsAccess);
  const user = data.users.find((u) => u.id === viewer.id);
  if (!user) return { ok: false, message: "Account not found." };

  const now = new Date().toISOString();
  const tx: PaymentTransaction = {
    id: randomId("txn"),
    txRef: newTxRef(randomHex(16)),
    userId: viewer.id,
    planId: plan.id,
    audience: plan.audience,
    purpose: live ? "renewal" : "new",
    amount,
    currency: plan.currency,
    promoCodeId: promo?.id ?? null,
    status: "initiated",
    provider: "flutterwave",
    environment: environmentOf(mode),
    providerTransactionId: null,
    providerRef: null,
    paymentType: null,
    chargedAmount: null,
    overpaid: false,
    failureReason: null,
    verifiedAt: null,
    subscriptionId: live?.id ?? null,
    refundStatus: "none",
    createdAt: now,
    updatedAt: now,
  };
  const reqId = await requestId();
  await writeData(scope(asService("checkout"), {}), (draft) => {
    draft.transactions.push(tx);
    appendAudit(draft, { actor: actorOf(viewer), action: "payment.initiated", entityType: "payment_transaction", entityId: tx.id, after: { txRef: tx.txRef, amount, currency: tx.currency, planId: plan.id, environment: tx.environment } }, reqId);
  });

  try {
    const { link } = await createHostedPayment(config, {
      txRef: tx.txRef,
      amount,
      currency: plan.currency,
      redirectUrl: `${appUrl()}/api/payments/flutterwave/callback`,
      customer: { email: user.email, name: user.displayName, phone: user.phone },
      title: brand.name,
      description: plan.name,
      paymentOptions: paymentOptionsFor(plan.currency, recurring),
      paymentPlanId: recurring ? plan.providerPlanId : null,
      meta: { sonara_tx: tx.id, renewal: input.renewal },
      sessionDurationMinutes: 60,
    });
    await writeData(scope(asService("checkout"), { transactions: where("t.id = $1", tx.id) }), (draft) => {
      const t = draft.transactions.find((entry) => entry.id === tx.id);
      if (t && t.status === "initiated") Object.assign(t, { status: "pending", updatedAt: new Date().toISOString() });
    });
    return { ok: true, redirectTo: link };
  } catch (error) {
    const message = error instanceof FlutterwaveError ? error.message : "unexpected error";
    console.error(`[payments] checkout creation failed for ${tx.txRef}: ${message}`);
    await writeData(scope(asService("checkout"), { transactions: where("t.id = $1", tx.id) }), (draft) => {
      const t = draft.transactions.find((entry) => entry.id === tx.id);
      if (t) Object.assign(t, { status: "failed", failureReason: "Checkout could not be created", updatedAt: new Date().toISOString() });
    });
    return { ok: false, message: "We could not start the payment with Flutterwave. No money was taken. Please try again in a few minutes." };
  }
}

/* -------------------------------------------------------------- verification */

/**
 * Records a verified recurring card charge (Flutterwave tx_ref, no Sonara reference)
 * against the single matching automatic-renewal subscription. Returns null when no
 * unique match exists; the caller then logs it for finance instead of guessing.
 */
function recurringTransaction(draft: DataShape, verified: Awaited<ReturnType<typeof verifyTransaction>>, mode: ReturnType<typeof paymentMode>, reqId: string): PaymentTransaction | null {
  const user = draft.users.find((u) => u.email === (verified.customerEmail ?? "").toLowerCase());
  if (!user) return null;
  const match = matchRecurringCharge(verified, draft.subscriptions.filter((s) => s.userId === user.id), draft.plans);
  if (!match.ok) {
    appendAudit(draft, { actor: null, action: "payment.recurring_unmatched", entityType: "payment_transaction", entityId: null, after: { providerTransactionId: verified.id, reason: match.reason } }, reqId);
    return null;
  }
  const now = new Date().toISOString();
  const tx: PaymentTransaction = {
    id: randomId("txn"),
    txRef: newTxRef(randomHex(16)),
    providerTxRef: verified.txRef,
    userId: user.id,
    planId: match.plan.id,
    audience: match.plan.audience,
    purpose: "renewal",
    amount: match.plan.amount,
    currency: match.plan.currency,
    promoCodeId: null,
    status: "pending",
    provider: "flutterwave",
    environment: environmentOf(mode),
    providerTransactionId: null,
    providerRef: null,
    paymentType: null,
    chargedAmount: null,
    overpaid: false,
    failureReason: null,
    verifiedAt: null,
    subscriptionId: match.subscription.id,
    refundStatus: "none",
    createdAt: now,
    updatedAt: now,
  };
  draft.transactions.push(tx);
  appendAudit(draft, { actor: null, action: "payment.recurring_charge_recorded", entityType: "payment_transaction", entityId: tx.id, after: { providerTxRef: verified.txRef, subscriptionId: match.subscription.id } }, reqId);
  return tx;
}

export type ConfirmOutcome = { status: PaymentTransaction["status"] | "unknown"; txRef: string | null; applied: boolean };

/**
 * Re-verifies a provider transaction and applies the result. Safe to call any
 * number of times, from the webhook, the browser callback or reconciliation.
 */
export async function confirmTransaction(providerTransactionId: string, origin: "webhook" | "callback" | "reconcile", actor: Viewer | null = null): Promise<ConfirmOutcome> {
  const data = await readData(scope(asService("payment processor"), {}));
  const mode = paymentMode(data.settings);
  const config = flutterwaveConfig(mode);
  if (!config) throw new Error("payments not configured");
  const verified = await verifyTransaction(config, providerTransactionId);
  const reqId = await requestId();

  const email = (verified.customerEmail ?? "").toLowerCase();
  const byCustomer = "(select id from auth.users where lower(email) = $2 and $2 <> '')";
  const load = {
    transactions: where("t.tx_ref = $1 or t.provider_tx_ref = $1 or t.provider_transaction_id = $2", verified.txRef, verified.id),
    subscriptions: where(`t.profile_id in (select profile_id from public.payment_transactions where tx_ref = $1) or t.profile_id in ${byCustomer}`, verified.txRef, email),
    plans: true as const,
    promos: where("t.id in (select promo_code_id from public.payment_transactions where tx_ref = $1)", verified.txRef),
    users: where(`t.id in (select profile_id from public.payment_transactions where tx_ref = $1) or t.id in ${byCustomer}`, verified.txRef, email),
  };
  return writeData(scope(asService("payment processor"), load), (draft) => {
    let tx = draft.transactions.find((t) => t.txRef === verified.txRef || t.providerTxRef === verified.txRef);
    if (!tx) {
      // Not a Sonara reference: possibly a recurring card charge initiated by Flutterwave.
      const recurring = recurringTransaction(draft, verified, mode, reqId);
      if (!recurring) {
        appendAudit(draft, { actor: null, action: "payment.unknown_reference", entityType: "payment_transaction", entityId: null, after: { txRef: verified.txRef, providerTransactionId, origin } }, reqId);
        return { status: "unknown" as const, txRef: verified.txRef, applied: false };
      }
      tx = recurring;
    }
    const clash = draft.transactions.find((t) => t.providerTransactionId === verified.id && t.id !== tx.id);
    if (clash) {
      appendAudit(draft, { actor: null, action: "payment.provider_id_reused", entityType: "payment_transaction", entityId: tx.id, after: { providerTransactionId: verified.id, otherTx: clash.id } }, reqId);
      return { status: tx.status, txRef: tx.txRef, applied: false };
    }
    // A recurring charge carries Flutterwave's reference; compare against what we recorded for it.
    const outcome = evaluateVerification({ txRef: tx.providerTxRef ?? tx.txRef, amount: tx.amount, currency: tx.currency }, verified);
    const before = { status: tx.status };
    if (!canMoveTransaction(tx.status, outcome.status)) {
      return { status: tx.status, txRef: tx.txRef, applied: false };
    }
    const at = new Date().toISOString();
    Object.assign(tx, {
      status: outcome.status,
      providerTransactionId: verified.id,
      providerRef: verified.providerRef,
      paymentType: verified.paymentType,
      chargedAmount: outcome.chargedMinor,
      overpaid: outcome.overpaid,
      failureReason: outcome.reasons.join("; ") || null,
      verifiedAt: outcome.status === "pending" ? tx.verifiedAt : at,
      updatedAt: at,
    });
    const user = draft.users.find((u) => u.id === tx.userId);
    const plan = draft.plans.find((p) => p.id === tx.planId);
    let applied = false;

    if (outcome.status === "successful" && plan && user) {
      const existing = draft.subscriptions.find((s) => s.userId === tx.userId && s.audience === plan.audience && s.status !== "expired" && s.status !== "pending") ?? null;
      const result = applySuccessfulPayment({
        existing,
        plan,
        userId: tx.userId,
        transactionId: tx.id,
        newSubscriptionId: randomId("sub"),
        renewalMode: plan.providerPlanId && verified.paymentType === "card" ? "card_auto" : "manual",
        now: new Date(),
        graceDays: draft.settings.graceDays,
      });
      if (result.applied) {
        applied = true;
        if (existing) Object.assign(existing, result.subscription);
        else draft.subscriptions.push(result.subscription);
        Object.assign(tx, { subscriptionId: result.subscription.id });
        if (tx.promoCodeId) {
          const promo = draft.promos.find((p) => p.id === tx.promoCodeId);
          if (promo) (promo as { redemptions: number }).redemptions += 1;
        }
        notify(draft, user, "payment_receipt", { amount: money(tx.amount, tx.currency), plan: plan.name, ref: tx.txRef, method: verified.paymentType ?? "Flutterwave" });
        notify(draft, user, "subscription_confirmed", { plan: plan.name, until: new Date(result.subscription.currentPeriodEnd!).toDateString() });
      }
    }
    if ((outcome.status === "failed" || outcome.status === "mismatch") && user && plan) {
      notify(draft, user, "payment_failed", { plan: plan.name, ref: tx.txRef });
      if (tx.purpose === "renewal" && tx.subscriptionId) {
        const sub = draft.subscriptions.find((s) => s.id === tx.subscriptionId);
        if (sub) Object.assign(sub, markPaymentFailed(sub, new Date()));
      }
    }
    appendAudit(draft, { actor: actor ? actorOf(actor) : null, action: `payment.verified.${outcome.status}`, entityType: "payment_transaction", entityId: tx.id, before, after: { status: tx.status, origin, applied, reasons: outcome.reasons, overpaid: outcome.overpaid } }, reqId);
    return { status: tx.status, txRef: tx.txRef, applied };
  });
}

/* ------------------------------------------------------------------ webhooks */

const MAX_WEBHOOK_LOG = 5_000;

function summarise(raw: Record<string, unknown>): Record<string, unknown> {
  const data = (raw.data ?? {}) as Record<string, unknown>;
  // Customer PII and card details are not kept in the webhook log.
  return { event: raw.event ?? raw["event.type"], id: data.id, tx_ref: data.tx_ref, status: data.status, amount: data.amount, currency: data.currency, payment_type: data.payment_type };
}

export async function handleFlutterwaveWebhook(rawBody: string, verifHash: string | null): Promise<{ httpStatus: number; body: string }> {
  const data = await readData(scope(asService("webhook"), {}));
  const mode = paymentMode(data.settings);
  const secret = webhookSecretHash(mode);
  const now = new Date().toISOString();
  const record = (patch: Partial<WebhookEventRecord> & Pick<WebhookEventRecord, "signatureValid" | "processingStatus">) =>
    writeData(scope(asService("webhook"), {}), (draft) => {
      draft.webhookEvents.push({ id: randomId("whk"), provider: "flutterwave", idempotencyKey: null, eventType: null, providerTransactionId: null, txRef: null, error: null, payloadSummary: null, receivedAt: now, processedAt: null, attempts: 1, ...patch });
      if (draft.webhookEvents.length > MAX_WEBHOOK_LOG) draft.webhookEvents.splice(0, draft.webhookEvents.length - MAX_WEBHOOK_LOG);
    });

  if (!verifyWebhookHash(verifHash, secret)) {
    await record({ signatureValid: false, processingStatus: "rejected", error: secret ? "verif-hash mismatch" : "webhook secret hash not configured" });
    console.warn("[payments] rejected webhook: invalid or missing verif-hash");
    return { httpStatus: 401, body: "invalid signature" };
  }
  const event = parseWebhook(rawBody);
  if (!event) {
    await record({ signatureValid: true, processingStatus: "rejected", error: "unparseable body" });
    return { httpStatus: 400, body: "bad payload" };
  }
  const key = webhookIdempotencyKey(event);

  // Claim the key. A processed or ignored delivery is a duplicate; a failed one may be retried.
  const claim = await writeData(scope(asService("webhook"), { webhookEvents: where("t.idempotency_key = $1", key) }), (draft) => {
    const existing = draft.webhookEvents.find((w) => w.idempotencyKey === key);
    if (existing && existing.processingStatus !== "failed") {
      existing.attempts += 1;
      return { duplicate: true as const, id: existing.id };
    }
    if (existing) {
      existing.attempts += 1;
      existing.processingStatus = "received";
      return { duplicate: false as const, id: existing.id };
    }
    const id = randomId("whk");
    draft.webhookEvents.push({ id, provider: "flutterwave", idempotencyKey: key, eventType: event.event, providerTransactionId: event.providerTransactionId, txRef: event.txRef, signatureValid: true, processingStatus: "received", error: null, payloadSummary: summarise(event.raw), receivedAt: now, processedAt: null, attempts: 1 });
    return { duplicate: false as const, id };
  });
  if (claim.duplicate) return { httpStatus: 200, body: "duplicate" };

  const finish = (status: WebhookEventRecord["processingStatus"], error: string | null = null) =>
    writeData(scope(asService("webhook"), { webhookEvents: where("t.id::text = $1", claim.id) }), (draft) => {
      const w = draft.webhookEvents.find((entry) => entry.id === claim.id);
      if (w) Object.assign(w, { processingStatus: status, error, processedAt: new Date().toISOString() });
    });

  try {
    if (event.event === "charge.completed") {
      if (!event.providerTransactionId) {
        await finish("ignored", "no transaction id");
        return { httpStatus: 200, body: "ignored" };
      }
      const result = await confirmTransaction(event.providerTransactionId, "webhook");
      await finish(result.status === "unknown" ? "ignored" : "processed", result.status === "unknown" ? "unknown tx_ref" : null);
      return { httpStatus: 200, body: "ok" };
    }
    if (event.event === "subscription.cancelled") {
      const email = (event.customerEmail ?? "").toLowerCase();
      const byCustomer = "(select id from auth.users where lower(email) = $1 and $1 <> '')";
      await writeData(scope(asService("webhook"), { users: where(`t.id in ${byCustomer}`, email), plans: true, subscriptions: where(`t.profile_id in ${byCustomer}`, email) }), (draft) => {
        const user = draft.users.find((u) => u.email === (event.customerEmail ?? "").toLowerCase());
        const plan = draft.plans.find((p) => p.providerPlanId && p.providerPlanId === event.planId);
        const sub = user && plan ? draft.subscriptions.find((s) => s.userId === user.id && s.planId === plan.id && s.renewalMode === "card_auto") : undefined;
        if (sub && !sub.cancelAtPeriodEnd) {
          Object.assign(sub, { cancelAtPeriodEnd: true, cancelledAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
          if (user) notify(draft, user, "subscription_cancelled", { until: sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd).toDateString() : "the end of the period" });
        }
      });
      await finish("processed");
      return { httpStatus: 200, body: "ok" };
    }
    await finish("ignored", `unhandled event ${event.event}`);
    return { httpStatus: 200, body: "ignored" };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 300) : "processing error";
    console.error(`[payments] webhook processing failed: ${message}`);
    await finish("failed", message);
    // Non-200 makes Flutterwave retry (if retries are enabled in the dashboard).
    return { httpStatus: 500, body: "processing failed" };
  }
}

/* ----------------------------------------------------------------- lifecycle */

export async function cancelMySubscription(viewer: Viewer, subscriptionId: string): Promise<{ ok: boolean; message: string }> {
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(subscriptionId)) return { ok: false, message: "Subscription not found." };
  const data = await readData(scope(asViewer(viewer), { subscriptions: where("t.id::text = $1 and t.profile_id = $2", subscriptionId, viewer.id), plans: true }));
  const sub = data.subscriptions.find((s) => s.id === subscriptionId && s.userId === viewer.id);
  if (!sub) return { ok: false, message: "Subscription not found." };
  const result = cancelAtPeriodEnd(sub, new Date(), data.settings.graceDays);
  if (!result.ok) return { ok: false, message: result.error === "already_cancelling" ? "This subscription is already set to end." : "This subscription is not active." };

  let providerNote = "";
  let providerSubscriptionId = sub.providerSubscriptionId;
  if (sub.renewalMode === "card_auto") {
    const config = flutterwaveConfig(paymentMode(data.settings));
    try {
      if (!config) throw new Error("payments not configured");
      if (!providerSubscriptionId) {
        // The id is not known until looked up (unverified list endpoint — see flutterwave.ts).
        const plan = data.plans.find((p) => p.id === sub.planId);
        const found = (await listSubscriptions(config, { email: viewer.email, planId: plan?.providerPlanId })).filter((x) => x.status === "active");
        if (found.length !== 1) throw new Error(`expected one active provider subscription, found ${found.length}`);
        providerSubscriptionId = found[0]!.id;
      }
      // Cancels this customer's subscription only, never the whole payment plan.
      await providerCancel(config, providerSubscriptionId);
    } catch (error) {
      providerNote = " We could not confirm the cancellation with Flutterwave; our team has been alerted and will stop the card renewal.";
      console.error(`[payments] provider cancel failed for ${sub.id}: ${(error as Error).message}`);
    }
  }
  const reqId = await requestId();
  await writeData(scope(asViewer(viewer), { subscriptions: where("t.id = $1 and t.profile_id = $2", sub.id, viewer.id), users: where("t.id = $1", viewer.id) }), (draft) => {
    const target = draft.subscriptions.find((s) => s.id === sub.id);
    const user = draft.users.find((u) => u.id === viewer.id);
    if (!target || !user) return;
    Object.assign(target, result.subscription, { providerSubscriptionId: providerSubscriptionId ?? target.providerSubscriptionId });
    notify(draft, user, "subscription_cancelled", { until: target.currentPeriodEnd ? new Date(target.currentPeriodEnd).toDateString() : "now" });
    appendAudit(draft, { actor: actorOf(viewer), action: "subscription.cancel_requested", entityType: "subscription", entityId: sub.id, after: { cancelAtPeriodEnd: true, providerCancelFailed: Boolean(providerNote) } }, reqId);
  });
  return { ok: true, message: `Your subscription will not renew. You keep access until ${sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd).toDateString() : "the end of the period"}.${providerNote}` };
}

export async function resumeMySubscription(viewer: Viewer, subscriptionId: string): Promise<{ ok: boolean; message: string }> {
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(subscriptionId)) return { ok: false, message: "Subscription not found." };
  const reqId = await requestId();
  return writeData(scope(asViewer(viewer), { subscriptions: where("t.id::text = $1 and t.profile_id = $2", subscriptionId, viewer.id) }), (data) => {
    const sub = data.subscriptions.find((s) => s.id === subscriptionId && s.userId === viewer.id);
    if (!sub) return { ok: false, message: "Subscription not found." };
    const result = resumeSubscription(sub, new Date());
    if (!result.ok) return { ok: false, message: "This subscription cannot be resumed. Start a new one instead." };
    Object.assign(sub, result.subscription);
    appendAudit(data, { actor: actorOf(viewer), action: "subscription.resumed", entityType: "subscription", entityId: sub.id }, reqId);
    return { ok: true, message: sub.renewalMode === "manual" ? "Your subscription is active again. Renew before it ends to keep access." : "Your subscription will renew again." };
  });
}

export async function requestRefund(viewer: Viewer, transactionId: string, reason: string): Promise<{ ok: boolean; message: string }> {
  if (reason.trim().length < 5) return { ok: false, message: "Tell us briefly why you are requesting a refund." };
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(transactionId)) return { ok: false, message: "Only your own successful payments can be refunded." };
  const reqId = await requestId();
  const load = { transactions: where("t.id::text = $1 and t.profile_id = $2", transactionId, viewer.id), refunds: where("t.transaction_id::text = $1", transactionId) };
  return writeData(scope(asViewer(viewer), load), (data) => {
    const tx = data.transactions.find((t) => t.id === transactionId && t.userId === viewer.id);
    if (!tx || tx.status !== "successful") return { ok: false, message: "Only your own successful payments can be refunded." };
    if (data.refunds.some((r) => r.transactionId === tx.id && r.status !== "rejected")) return { ok: false, message: "A refund request for this payment already exists." };
    const refund: RefundRequest = { id: randomId("rfd"), transactionId: tx.id, requestedBy: viewer.id, reason: reason.trim().slice(0, 2000), status: "requested", decidedBy: null, decidedAt: null, decisionNote: null, createdAt: new Date().toISOString() };
    data.refunds.push(refund);
    Object.assign(tx, { refundStatus: "requested", updatedAt: new Date().toISOString() });
    appendAudit(data, { actor: actorOf(viewer), action: "refund.requested", entityType: "refund_request", entityId: refund.id, after: { transactionId: tx.id } }, reqId);
    return { ok: true, message: "Refund requested. Our finance team will review it." };
  });
}

/* -------------------------------------------------------------------- admin */

function requirePermission(viewer: Viewer, permission: Parameters<typeof staffCan>[1]) {
  if (!staffCan(viewer.roles, permission)) throw new CommandError("Your role does not allow this action.");
}

export async function adminBilling(viewer: Viewer) {
  // Staff RLS decides: finance/admin see everything; support sees subscriptions and payments, not webhook payloads.
  const data = await readData(
    scope(asViewer(viewer), { plans: true, promos: true, subscriptions: true, transactions: true, webhookEvents: true, overrides: true, refunds: true, users: true }),
  );
  return adminBillingFrom(data);
}

export function adminBillingFrom(data: Readonly<DataShape>) {
  const now = new Date();
  const issues = reconcile({ transactions: data.transactions, subscriptions: data.subscriptions, overrides: data.overrides, now, graceDays: data.settings.graceDays });
  return { ...data, issues, now };
}

export type PlanInput = Omit<Plan, "id" | "providerPlanId"> & { id?: string };

export async function savePlan(viewer: Viewer, input: PlanInput): Promise<Plan> {
  requirePermission(viewer, "plans:manage");
  const errors = validatePlan({ ...input, providerPlanId: null });
  if (errors.length) {
    const messages: Record<string, string> = {
      name_required: "Name is required.",
      code_invalid: "Code must be lowercase letters, numbers, - or _ (2–40).",
      amount_invalid: "Price must be a whole, positive amount.",
      currency_invalid: "Unsupported currency.",
      limits_required: "Creator plans need limits.",
      limits_forbidden: "Listener plans cannot carry creator limits.",
      trial_invalid: "Trial days must be between 0 and 90.",
    };
    throw new CommandError(errors.map((e) => messages[e] ?? e).join(" "));
  }
  const reqId = await requestId();
  return writeData(scope(asViewer(viewer), { plans: true }), (data) => {
    if (data.plans.some((p) => p.code === input.code && p.id !== input.id)) throw new CommandError("Another plan already uses that code.", "code");
    const existing = input.id ? data.plans.find((p) => p.id === input.id) : undefined;
    if (input.id && !existing) throw new CommandError("Plan not found.");
    if (existing) {
      if (existing.audience !== input.audience) throw new CommandError("A plan's audience cannot change. Create a new plan instead.");
      const before = { ...existing };
      // A price change detaches the Flutterwave plan; a new one must be created for card renewals.
      const priceChanged = existing.amount !== input.amount || existing.currency !== input.currency || existing.interval !== input.interval;
      Object.assign(existing, { ...input, id: existing.id, providerPlanId: priceChanged ? null : existing.providerPlanId });
      appendAudit(data, { actor: actorOf(viewer), action: priceChanged ? "plan.repriced" : "plan.updated", entityType: "plan", entityId: existing.id, before, after: existing }, reqId);
      return existing;
    }
    const plan: Plan = { ...input, id: randomId("plan"), providerPlanId: null };
    data.plans.push(plan);
    appendAudit(data, { actor: actorOf(viewer), action: "plan.created", entityType: "plan", entityId: plan.id, after: plan }, reqId);
    return plan;
  });
}

export async function createProviderPlan(viewer: Viewer, planId: string): Promise<string> {
  requirePermission(viewer, "plans:manage");
  const data = await readData(scope(asViewer(viewer), { plans: where("t.id::text = $1", planId) }));
  const plan = data.plans.find((p) => p.id === planId);
  if (!plan) throw new CommandError("Plan not found.");
  if (plan.priceIsPlaceholder) throw new CommandError("Approve the price (clear the placeholder flag) before creating a recurring Flutterwave plan.");
  const config = flutterwaveConfig(paymentMode(data.settings));
  if (!config) throw new CommandError("Payments are not configured.");
  const { id } = await createPaymentPlan(config, { name: `${brand.name} ${plan.name}`, amount: plan.amount, currency: plan.currency, interval: plan.interval });
  const reqId = await requestId();
  await writeData(scope(asViewer(viewer), { plans: where("t.id::text = $1", planId) }), (draft) => {
    const p = draft.plans.find((entry) => entry.id === planId);
    if (p) (p as { providerPlanId: string | null }).providerPlanId = id;
    appendAudit(draft, { actor: actorOf(viewer), action: "plan.provider_plan_created", entityType: "plan", entityId: planId, after: { providerPlanId: id } }, reqId);
  });
  return id;
}

export async function savePromo(viewer: Viewer, input: Omit<PromoCode, "id" | "redemptions">): Promise<void> {
  requirePermission(viewer, "plans:manage");
  const code = normalisePromoCode(input.code);
  if (!/^[A-Z0-9]{3,32}$/.test(code)) throw new CommandError("Codes are 3–32 letters and numbers.", "code");
  if ((input.percentOff === null) === (input.amountOff === null)) throw new CommandError("Set either a percentage or an amount off.");
  if (input.percentOff !== null && (input.percentOff < 1 || input.percentOff > 99)) throw new CommandError("Percentage must be 1–99.");
  const reqId = await requestId();
  await writeData(scope(asViewer(viewer), { promos: true }), (data) => {
    const existing = data.promos.find((p) => p.code === code);
    if (existing) {
      const before = { ...existing };
      Object.assign(existing, { ...input, code });
      appendAudit(data, { actor: actorOf(viewer), action: "promo.updated", entityType: "promo_code", entityId: existing.id, before, after: existing }, reqId);
      return;
    }
    const promo: PromoCode = { ...input, code, id: randomId("promo"), redemptions: 0 };
    data.promos.push(promo);
    appendAudit(data, { actor: actorOf(viewer), action: "promo.created", entityType: "promo_code", entityId: promo.id, after: promo }, reqId);
  });
}

export async function grantOverride(viewer: Viewer, input: { userId: string; audience: PlanAudience; effect: "grant" | "revoke"; validUntil: string | null; reason: string; planId: string | null }): Promise<void> {
  requirePermission(viewer, "subscriptions:override");
  if (input.userId === viewer.id) throw new CommandError("You cannot adjust your own entitlements.");
  if (input.reason.trim().length < 5) throw new CommandError("Give a reason (at least 5 characters). It is recorded in the audit log.", "reason");
  if (input.validUntil && Date.parse(input.validUntil) <= Date.now()) throw new CommandError("The end date must be in the future.", "validUntil");
  const reqId = await requestId();
  await writeData(scope(asViewer(viewer), { users: where("t.id::text = $1", input.userId), plans: true }), (data) => {
    const user = data.users.find((u) => u.id === input.userId);
    if (!user) throw new CommandError("User not found.");
    if (input.audience === "creator" && input.effect === "grant" && !data.plans.some((p) => p.id === input.planId && p.audience === "creator")) {
      throw new CommandError("Choose the creator plan whose limits apply.", "planId");
    }
    const override: EntitlementOverride = {
      id: randomId("ovr"),
      userId: input.userId,
      audience: input.audience,
      effect: input.effect,
      planId: input.audience === "creator" ? input.planId : null,
      validFrom: new Date().toISOString(),
      validUntil: input.validUntil,
      reason: input.reason.trim(),
      createdBy: viewer.id,
      createdAt: new Date().toISOString(),
      revokedAt: null,
      revokedBy: null,
    };
    data.overrides.push(override);
    appendAudit(data, { actor: actorOf(viewer), action: `entitlement.${input.effect}`, entityType: "entitlement_override", entityId: override.id, after: { userId: input.userId, audience: input.audience, validUntil: input.validUntil }, reason: override.reason }, reqId);
  });
}

export async function revokeOverride(viewer: Viewer, overrideId: string, reason: string): Promise<void> {
  requirePermission(viewer, "subscriptions:override");
  if (reason.trim().length < 5) throw new CommandError("Give a reason.", "reason");
  const reqId = await requestId();
  await writeData(scope(asViewer(viewer), { overrides: where("t.id::text = $1", overrideId) }), (data) => {
    const o = data.overrides.find((entry) => entry.id === overrideId && !entry.revokedAt);
    if (!o) throw new CommandError("Override not found or already revoked.");
    if (o.userId === viewer.id) throw new CommandError("You cannot adjust your own entitlements.");
    const before = { ...o };
    Object.assign(o, { revokedAt: new Date().toISOString(), revokedBy: viewer.id, revokeReason: reason.trim() });
    appendAudit(data, { actor: actorOf(viewer), action: "entitlement.override_revoked", entityType: "entitlement_override", entityId: o.id, before, after: o, reason: reason.trim() }, reqId);
  });
}

export async function decideRefund(viewer: Viewer, refundId: string, decision: "approved" | "rejected" | "refunded", note: string): Promise<void> {
  requirePermission(viewer, "payments:reconcile");
  if (note.trim().length < 3) throw new CommandError("Add a decision note.", "note");
  const reqId = await requestId();
  const load = { refunds: where("t.id::text = $1", refundId), transactions: where("t.id in (select transaction_id from public.refund_requests where id::text = $1)", refundId) };
  await writeData(scope(asViewer(viewer), load), (data) => {
    const refund = data.refunds.find((r) => r.id === refundId);
    if (!refund) throw new CommandError("Refund request not found.");
    if (refund.requestedBy === viewer.id) throw new CommandError("You cannot decide your own refund request.");
    const tx = data.transactions.find((t) => t.id === refund.transactionId);
    const before = { ...refund };
    Object.assign(refund, { status: decision, decidedBy: viewer.id, decidedAt: new Date().toISOString(), decisionNote: note.trim() });
    if (tx) Object.assign(tx, { refundStatus: decision === "approved" ? "processing" : decision === "refunded" ? "refunded" : "rejected", updatedAt: new Date().toISOString() });
    appendAudit(data, { actor: actorOf(viewer), action: `refund.${decision}`, entityType: "refund_request", entityId: refund.id, before, after: refund, reason: note.trim() }, reqId);
  });
}

/** Re-verifies stale pending transactions that have a provider id, then reports inconsistencies. */
export async function reconcileNow(viewer: Viewer): Promise<{ checked: number; changed: number; errors: number }> {
  requirePermission(viewer, "payments:reconcile");
  const data = await readData(scope(asViewer(viewer), { transactions: where("t.status in ('pending', 'initiated') and t.provider_transaction_id is not null") }));
  const candidates = data.transactions.filter((t) => (t.status === "pending" || t.status === "initiated") && t.providerTransactionId);
  let changed = 0;
  let errors = 0;
  for (const tx of candidates) {
    try {
      const result = await confirmTransaction(tx.providerTransactionId!, "reconcile", viewer);
      if (result.status !== tx.status) changed += 1;
    } catch {
      errors += 1;
    }
  }
  const reqId = await requestId();
  await writeData(scope(asViewer(viewer), {}), (draft) => {
    appendAudit(draft, { actor: actorOf(viewer), action: "payments.reconciled", entityType: "payments", entityId: null, after: { checked: candidates.length, changed, errors } }, reqId);
  });
  return { checked: candidates.length, changed, errors };
}

/**
 * Billing housekeeping (run from the admin console until a scheduler exists):
 * renewal reminders for manual renewals at 7 and 1 days, and marking subscriptions
 * expired after grace. Access never depends on this job; it is computed from dates.
 */
export async function runBillingJobs(viewer: Viewer): Promise<{ reminders: number; expired: number }> {
  requirePermission(viewer, "payments:reconcile");
  const reqId = await requestId();
  if (isSupabase()) await retryFailedEmails();
  const load = { subscriptions: true as const, users: true as const, plans: true as const, notifications: whereSystem("t.kind = 'renewal_reminder'") };
  return writeData(scope(asViewer(viewer), load), (data) => {
    const now = new Date();
    let reminders = 0;
    let expired = 0;
    for (const sub of data.subscriptions) {
      const user = data.users.find((u) => u.id === sub.userId);
      const plan = data.plans.find((p) => p.id === sub.planId);
      if (!user || !plan || !sub.currentPeriodEnd) continue;
      const eff = effectiveState(sub, now, data.settings.graceDays);
      if (eff.state === "expired" && sub.status !== "expired") {
        (sub as { status: Subscription["status"] }).status = "expired";
        expired += 1;
        continue;
      }
      if (sub.renewalMode !== "manual" || sub.cancelAtPeriodEnd || sub.isTrial) continue;
      const days = daysUntil(sub.currentPeriodEnd, now);
      if (days === 7 || days === 1) {
        const until = `${new Date(sub.currentPeriodEnd).toDateString()} (${days === 1 ? "tomorrow" : "in 7 days"})`;
        const body = `${plan.name} ends on ${until}.`;
        // One reminder per subscription period and threshold, however often the job runs.
        if (data.notifications.some((n) => n.kind === "renewal_reminder" && n.userId === user.id && n.body === body)) continue;
        notify(data, user, "renewal_reminder", { plan: plan.name, until });
        reminders += 1;
      }
    }
    appendAudit(data, { actor: actorOf(viewer), action: "billing.jobs_run", entityType: "billing", entityId: null, after: { reminders, expired } }, reqId);
    return { reminders, expired };
  });
}

export function graceEndsAt(sub: Subscription, data: Pick<DataShape, "settings">): string | null {
  return sub.currentPeriodEnd ? addDays(sub.currentPeriodEnd, data.settings.graceDays) : null;
}
