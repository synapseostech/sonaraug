/**
 * Matching Flutterwave-initiated recurring card charges to Sonara subscriptions.
 *
 * A recurring charge reaches us as charge.completed with Flutterwave's own tx_ref
 * and, per the documented samples, no plan or subscription id. After the charge
 * has been VERIFIED by id, it is matched to exactly one active automatic-renewal
 * subscription of the same customer whose plan has the same amount and currency.
 * Zero or several candidates ⇒ no match: finance resolves it by hand
 * (reconciliation lists unmatched verified charges). Never guess.
 */
import { fromMajorUnits } from "./money.ts";
import type { Plan } from "./plans.ts";
import type { Subscription } from "./subscriptions.ts";
import type { VerifiedProviderTransaction } from "./transactions.ts";

export type RecurringMatch =
  | { ok: true; subscription: Subscription; plan: Plan }
  | { ok: false; reason: "not_card" | "no_customer" | "no_candidate" | "ambiguous" };

export function matchRecurringCharge(verified: VerifiedProviderTransaction, userSubscriptions: readonly Subscription[], plans: readonly Plan[]): RecurringMatch {
  if ((verified.paymentType ?? "").toLowerCase() !== "card") return { ok: false, reason: "not_card" };
  if (!verified.customerEmail) return { ok: false, reason: "no_customer" };
  let minor: number;
  try {
    minor = fromMajorUnits(verified.amount, verified.currency);
  } catch {
    return { ok: false, reason: "no_candidate" };
  }
  const candidates = userSubscriptions.flatMap((s) => {
    if (s.renewalMode !== "card_auto" || s.status === "expired" || s.status === "pending") return [];
    const plan = plans.find((p) => p.id === s.planId);
    if (!plan || !plan.providerPlanId || plan.currency !== verified.currency || plan.amount !== minor) return [];
    return [{ subscription: s, plan }];
  });
  if (candidates.length === 0) return { ok: false, reason: "no_candidate" };
  if (candidates.length > 1) return { ok: false, reason: "ambiguous" };
  return { ok: true, ...candidates[0]! };
}
