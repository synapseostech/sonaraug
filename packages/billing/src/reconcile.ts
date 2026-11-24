/**
 * Reconciliation: finds records that disagree with each other, so finance can
 * act on them. It never fixes anything itself.
 */
import type { EntitlementOverride } from "./entitlements.ts";
import { overrideIsActive } from "./entitlements.ts";
import { effectiveState, type Subscription } from "./subscriptions.ts";
import type { PaymentTransaction } from "./transactions.ts";

export type ReconciliationIssueKind =
  | "stale_pending"
  | "successful_not_applied"
  | "applied_not_successful"
  | "amount_or_currency_mismatch"
  | "overpaid"
  | "access_without_payment"
  | "reversed_still_applied";

export type ReconciliationIssue = {
  readonly kind: ReconciliationIssueKind;
  readonly severity: "high" | "medium" | "low";
  readonly transactionId: string | null;
  readonly subscriptionId: string | null;
  readonly userId: string;
  readonly detail: string;
};

export function reconcile(input: {
  transactions: readonly PaymentTransaction[];
  subscriptions: readonly Subscription[];
  overrides: readonly EntitlementOverride[];
  now: Date;
  stalePendingMinutes?: number;
  graceDays: number;
}): ReconciliationIssue[] {
  const issues: ReconciliationIssue[] = [];
  const staleMs = (input.stalePendingMinutes ?? 60) * 60_000;
  const appliedBy = new Map<string, Subscription>();
  for (const sub of input.subscriptions) for (const txId of sub.appliedTransactionIds) appliedBy.set(txId, sub);

  for (const tx of input.transactions) {
    const sub = appliedBy.get(tx.id);
    if ((tx.status === "pending" || tx.status === "initiated") && input.now.getTime() - Date.parse(tx.createdAt) > staleMs) {
      issues.push({ kind: "stale_pending", severity: "medium", transactionId: tx.id, subscriptionId: null, userId: tx.userId, detail: `${tx.txRef} has been ${tx.status} since ${tx.createdAt}. Re-verify with the provider.` });
    }
    if (tx.status === "successful" && !sub) {
      issues.push({ kind: "successful_not_applied", severity: "high", transactionId: tx.id, subscriptionId: null, userId: tx.userId, detail: `${tx.txRef} was paid but no subscription was credited.` });
    }
    if (sub && tx.status !== "successful" && tx.status !== "reversed") {
      issues.push({ kind: "applied_not_successful", severity: "high", transactionId: tx.id, subscriptionId: sub.id, userId: tx.userId, detail: `${tx.txRef} is ${tx.status} but was credited to subscription ${sub.id}.` });
    }
    if (sub && tx.status === "reversed") {
      issues.push({ kind: "reversed_still_applied", severity: "high", transactionId: tx.id, subscriptionId: sub.id, userId: tx.userId, detail: `${tx.txRef} was reversed; review the access it granted.` });
    }
    if (tx.status === "mismatch") {
      issues.push({ kind: "amount_or_currency_mismatch", severity: "high", transactionId: tx.id, subscriptionId: null, userId: tx.userId, detail: `${tx.txRef}: ${tx.failureReason ?? "verification mismatch"}. No access was granted.` });
    }
    if (tx.overpaid) {
      issues.push({ kind: "overpaid", severity: "low", transactionId: tx.id, subscriptionId: sub?.id ?? null, userId: tx.userId, detail: `${tx.txRef} charged ${tx.chargedAmount} against an expected ${tx.amount}. Consider refunding the difference.` });
    }
  }

  for (const sub of input.subscriptions) {
    const eff = effectiveState(sub, input.now, input.graceDays);
    if (!eff.grantsAccess || sub.isTrial) continue;
    const paid = sub.appliedTransactionIds.some((id) => input.transactions.find((t) => t.id === id)?.status === "successful");
    const overridden = input.overrides.some((o) => o.userId === sub.userId && o.audience === sub.audience && o.effect === "grant" && overrideIsActive(o, input.now));
    if (!paid && !overridden) {
      issues.push({ kind: "access_without_payment", severity: "high", transactionId: null, subscriptionId: sub.id, userId: sub.userId, detail: `Subscription ${sub.id} grants access with no successful payment or override.` });
    }
  }
  return issues;
}
