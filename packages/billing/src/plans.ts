/**
 * Subscription plans. Two audiences, deliberately separate products:
 *  - listener plans unlock premium listening;
 *  - creator plans unlock publishing capacity.
 * Neither implies the other (see entitlements.ts).
 */
import { assertMoney } from "./money.ts";

export type PlanAudience = "listener" | "creator";
export type BillingInterval = "monthly" | "annual";

export type CreatorLimits = {
  readonly maxShows: number;
  readonly maxEpisodes: number;
  /** Per billing period. */
  readonly uploadAllowanceMb: number;
  readonly storageMb: number;
  readonly canPublish: boolean;
  readonly analytics: "none" | "basic" | "full";
  readonly promotion: boolean;
  readonly supportLevel: "community" | "standard" | "priority";
};

export type Plan = {
  readonly id: string;
  readonly audience: PlanAudience;
  readonly code: string;
  readonly name: string;
  readonly description: string;
  readonly interval: BillingInterval;
  /** Integer minor units. */
  readonly amount: number;
  readonly currency: string;
  readonly active: boolean;
  /** Days of free access before the first charge; 0 = none. Only offered when approved. */
  readonly trialDays: number;
  readonly features: readonly string[];
  readonly creatorLimits: CreatorLimits | null;
  /** Flutterwave payment plan id for card auto-renewal, when one has been created. */
  readonly providerPlanId: string | null;
  /** True until the owner approves the price. Shown on every surface that displays it. */
  readonly priceIsPlaceholder: boolean;
  readonly sortOrder: number;
};

export type PlanError = "name_required" | "code_invalid" | "amount_invalid" | "currency_invalid" | "limits_required" | "limits_forbidden" | "trial_invalid";

export function validatePlan(plan: Omit<Plan, "id">): PlanError[] {
  const errors: PlanError[] = [];
  if (!plan.name.trim()) errors.push("name_required");
  if (!/^[a-z0-9][a-z0-9_-]{1,39}$/.test(plan.code)) errors.push("code_invalid");
  try {
    assertMoney({ amount: plan.amount, currency: plan.currency });
    if (plan.amount <= 0) errors.push("amount_invalid");
  } catch (error) {
    errors.push(String(error).includes("currency") ? "currency_invalid" : "amount_invalid");
  }
  if (plan.audience === "creator" && !plan.creatorLimits) errors.push("limits_required");
  if (plan.audience === "listener" && plan.creatorLimits) errors.push("limits_forbidden");
  if (!Number.isInteger(plan.trialDays) || plan.trialDays < 0 || plan.trialDays > 90) errors.push("trial_invalid");
  return errors;
}

/** Adds one billing interval, clamping to the end of shorter months (31 Jan + 1 month = 28/29 Feb). */
export function addInterval(fromIso: string, interval: BillingInterval, count = 1): string {
  const from = new Date(fromIso);
  const months = interval === "monthly" ? count : count * 12;
  const target = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + months, 1, from.getUTCHours(), from.getUTCMinutes(), from.getUTCSeconds()));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(from.getUTCDate(), lastDay));
  return target.toISOString();
}

export const addDays = (fromIso: string, days: number): string => new Date(Date.parse(fromIso) + days * 86_400_000).toISOString();

export const INTERVAL_LABEL: Record<BillingInterval, string> = { monthly: "per month", annual: "per year" };
