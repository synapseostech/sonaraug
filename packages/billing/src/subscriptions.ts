/**
 * Subscription lifecycle.
 *
 * Access is computed from dates at read time. No cron job has to run for an
 * expired subscription to stop granting access.
 *
 *   pending ──verified payment──▶ active ──period ends──▶ grace ──grace ends──▶ expired
 *                                   │  ▲                     │
 *                          cancel   │  │ verified renewal    │ verified renewal
 *                                   ▼  │                     ▼
 *                              cancelling (access until period end, no grace) ──▶ expired
 *
 * Only a *verified* payment (provider re-query, amount/currency/reference
 * match) may call `applySuccessfulPayment`. A redirect or an unverified webhook
 * never does.
 */
import { addDays, addInterval, type Plan, type PlanAudience } from "./plans.ts";

export type SubscriptionStatus = "pending" | "active" | "past_due" | "expired";

/**
 * card_auto: a Flutterwave payment plan charges the card each period.
 * manual: the listener pays each period themselves (mobile money has no documented
 * recurring mandate on Flutterwave, so it is always manual).
 */
export type RenewalMode = "card_auto" | "manual";

export type Subscription = {
  readonly id: string;
  readonly userId: string;
  readonly planId: string;
  readonly audience: PlanAudience;
  readonly status: SubscriptionStatus;
  readonly currentPeriodStart: string | null;
  readonly currentPeriodEnd: string | null;
  readonly cancelAtPeriodEnd: boolean;
  readonly cancelledAt: string | null;
  readonly renewalMode: RenewalMode;
  readonly providerSubscriptionId: string | null;
  readonly isTrial: boolean;
  /** Internal transaction ids already credited to this subscription (idempotency). */
  readonly appliedTransactionIds: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type EffectiveState = "pending" | "trial" | "active" | "cancelling" | "grace" | "expired";

export type EffectiveSubscription = {
  readonly state: EffectiveState;
  readonly grantsAccess: boolean;
  /** When access ends if nothing else happens. */
  readonly accessUntil: string | null;
};

export const DEFAULT_GRACE_DAYS = 3;

export function effectiveState(sub: Subscription, now: Date, graceDays = DEFAULT_GRACE_DAYS): EffectiveSubscription {
  if (sub.status === "pending" || !sub.currentPeriodEnd) return { state: "pending", grantsAccess: false, accessUntil: null };
  if (sub.status === "expired") return { state: "expired", grantsAccess: false, accessUntil: sub.currentPeriodEnd };
  const end = Date.parse(sub.currentPeriodEnd);
  const t = now.getTime();
  if (t < end) {
    if (sub.cancelAtPeriodEnd) return { state: "cancelling", grantsAccess: true, accessUntil: sub.currentPeriodEnd };
    return { state: sub.isTrial ? "trial" : "active", grantsAccess: true, accessUntil: sub.currentPeriodEnd };
  }
  // Grace applies only to a subscription that was meant to renew and is not a trial.
  if (!sub.cancelAtPeriodEnd && !sub.isTrial && graceDays > 0) {
    const graceEnd = addDays(sub.currentPeriodEnd, graceDays);
    if (t < Date.parse(graceEnd)) return { state: "grace", grantsAccess: true, accessUntil: graceEnd };
  }
  return { state: "expired", grantsAccess: false, accessUntil: sub.currentPeriodEnd };
}

export type PaymentApplication = { subscription: Subscription; applied: boolean; renewal: boolean };

/**
 * Credits one verified payment to a subscription. Idempotent by transaction id:
 * applying the same transaction twice changes nothing, so duplicate webhooks
 * cannot double-extend access.
 */
export function applySuccessfulPayment(input: {
  existing: Subscription | null;
  plan: Plan;
  userId: string;
  transactionId: string;
  newSubscriptionId: string;
  renewalMode: RenewalMode;
  providerSubscriptionId?: string | null;
  now: Date;
  graceDays?: number;
}): PaymentApplication {
  const { existing, plan, now } = input;
  const at = now.toISOString();
  if (existing && existing.appliedTransactionIds.includes(input.transactionId)) {
    return { subscription: existing, applied: false, renewal: false };
  }
  if (existing && (existing.userId !== input.userId || existing.audience !== plan.audience)) {
    throw new Error("Payment does not belong to this subscription");
  }

  const current = existing ? effectiveState(existing, now, input.graceDays) : null;
  const continuing = Boolean(existing && current && current.grantsAccess && current.state !== "trial");
  // Renewing early or in grace extends from the end of the paid period, so no paid time is lost.
  const start = continuing && existing?.currentPeriodEnd ? existing.currentPeriodEnd : at;
  const end = addInterval(start, plan.interval);

  const base: Subscription = existing ?? {
    id: input.newSubscriptionId,
    userId: input.userId,
    planId: plan.id,
    audience: plan.audience,
    status: "pending",
    currentPeriodStart: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    cancelledAt: null,
    renewalMode: input.renewalMode,
    providerSubscriptionId: null,
    isTrial: false,
    appliedTransactionIds: [],
    createdAt: at,
    updatedAt: at,
  };

  return {
    applied: true,
    renewal: continuing,
    subscription: {
      ...base,
      planId: plan.id,
      status: "active",
      currentPeriodStart: start,
      currentPeriodEnd: end,
      cancelAtPeriodEnd: false,
      cancelledAt: null,
      isTrial: false,
      renewalMode: input.renewalMode,
      providerSubscriptionId: input.providerSubscriptionId ?? base.providerSubscriptionId,
      appliedTransactionIds: [...base.appliedTransactionIds, input.transactionId],
      updatedAt: at,
    },
  };
}

export type LifecycleError = "not_active" | "already_cancelling" | "not_cancelling" | "trial_used" | "trials_disabled";

export function cancelAtPeriodEnd(sub: Subscription, now: Date, graceDays?: number): { ok: true; subscription: Subscription } | { ok: false; error: LifecycleError } {
  const state = effectiveState(sub, now, graceDays);
  if (!state.grantsAccess && state.state !== "pending") return { ok: false, error: "not_active" };
  if (sub.cancelAtPeriodEnd) return { ok: false, error: "already_cancelling" };
  const at = now.toISOString();
  if (state.state === "pending") {
    return { ok: true, subscription: { ...sub, status: "expired", cancelAtPeriodEnd: true, cancelledAt: at, updatedAt: at } };
  }
  return { ok: true, subscription: { ...sub, cancelAtPeriodEnd: true, cancelledAt: at, updatedAt: at } };
}

export function resumeSubscription(sub: Subscription, now: Date): { ok: true; subscription: Subscription } | { ok: false; error: LifecycleError } {
  if (!sub.cancelAtPeriodEnd) return { ok: false, error: "not_cancelling" };
  if (!sub.currentPeriodEnd || Date.parse(sub.currentPeriodEnd) <= now.getTime()) return { ok: false, error: "not_active" };
  return { ok: true, subscription: { ...sub, cancelAtPeriodEnd: false, cancelledAt: null, updatedAt: now.toISOString() } };
}

export function markPaymentFailed(sub: Subscription, now: Date): Subscription {
  if (sub.status !== "active") return sub;
  return { ...sub, status: "past_due", updatedAt: now.toISOString() };
}

/** A trial needs trials enabled, a plan with trial days, and no earlier subscription of that audience. */
export function startTrial(input: {
  plan: Plan;
  userId: string;
  subscriptionId: string;
  history: readonly Subscription[];
  trialsEnabled: boolean;
  now: Date;
}): { ok: true; subscription: Subscription } | { ok: false; error: LifecycleError } {
  if (!input.trialsEnabled || input.plan.trialDays <= 0) return { ok: false, error: "trials_disabled" };
  if (input.history.some((s) => s.userId === input.userId && s.audience === input.plan.audience)) return { ok: false, error: "trial_used" };
  const at = input.now.toISOString();
  return {
    ok: true,
    subscription: {
      id: input.subscriptionId,
      userId: input.userId,
      planId: input.plan.id,
      audience: input.plan.audience,
      status: "active",
      currentPeriodStart: at,
      currentPeriodEnd: addDays(at, input.plan.trialDays),
      cancelAtPeriodEnd: false,
      cancelledAt: null,
      renewalMode: "manual",
      providerSubscriptionId: null,
      isTrial: true,
      appliedTransactionIds: [],
      createdAt: at,
      updatedAt: at,
    },
  };
}

/** Days until the period ends, for renewal reminders. Negative when already past. */
export const daysUntil = (iso: string, now: Date): number => Math.ceil((Date.parse(iso) - now.getTime()) / 86_400_000);
