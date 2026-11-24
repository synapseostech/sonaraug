import type { Plan } from "./plans.ts";

export type PromoCode = {
  readonly id: string;
  readonly code: string;
  readonly description: string;
  readonly percentOff: number | null;
  /** Minor units, in the plan's currency. */
  readonly amountOff: number | null;
  readonly currency: string | null;
  readonly planIds: readonly string[] | null;
  readonly validFrom: string | null;
  readonly validUntil: string | null;
  readonly maxRedemptions: number | null;
  readonly redemptions: number;
  readonly active: boolean;
};

export type PromoError = "not_found" | "inactive" | "not_started" | "expired" | "exhausted" | "not_applicable" | "currency_mismatch" | "would_be_free";

export type PromoResult = { ok: true; amount: number; discount: number } | { ok: false; error: PromoError; message: string };

const MESSAGES: Record<PromoError, string> = {
  not_found: "That promotional code is not recognised.",
  inactive: "That promotional code is no longer active.",
  not_started: "That promotional code is not valid yet.",
  expired: "That promotional code has expired.",
  exhausted: "That promotional code has been fully redeemed.",
  not_applicable: "That promotional code does not apply to this plan.",
  currency_mismatch: "That promotional code is for a different currency.",
  would_be_free: "Discounts cannot reduce a paid plan to zero. Complimentary access is granted by an administrator instead.",
};

export const normalisePromoCode = (code: string): string => code.trim().toUpperCase().replace(/\s+/g, "");

/**
 * Applies a promotional code to a plan price. A code can never make a plan free:
 * complimentary access is an audited administrator override, not a zero-value payment.
 */
export function applyPromo(plan: Plan, promo: PromoCode | null, now: Date): PromoResult {
  const fail = (error: PromoError): PromoResult => ({ ok: false, error, message: MESSAGES[error] });
  if (!promo) return fail("not_found");
  if (!promo.active) return fail("inactive");
  if (promo.validFrom && Date.parse(promo.validFrom) > now.getTime()) return fail("not_started");
  if (promo.validUntil && Date.parse(promo.validUntil) < now.getTime()) return fail("expired");
  if (promo.maxRedemptions !== null && promo.redemptions >= promo.maxRedemptions) return fail("exhausted");
  if (promo.planIds && promo.planIds.length > 0 && !promo.planIds.includes(plan.id)) return fail("not_applicable");

  let discount = 0;
  if (promo.percentOff !== null) {
    discount = Math.floor((plan.amount * Math.min(Math.max(promo.percentOff, 0), 100)) / 100);
  } else if (promo.amountOff !== null) {
    if (promo.currency !== plan.currency) return fail("currency_mismatch");
    discount = promo.amountOff;
  }
  const amount = plan.amount - discount;
  if (amount <= 0) return fail("would_be_free");
  return { ok: true, amount, discount };
}
