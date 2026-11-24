/**
 * Payment transactions and the rules for believing one.
 *
 * A transaction becomes "successful" only after Sonara re-queries the provider
 * (GET /v3/transactions/{id}/verify) and the response matches what Sonara
 * expected: same reference, same currency, amount at least the expected amount,
 * status "successful". This mirrors Flutterwave's own guidance. A browser
 * redirect's `status=successful` and an unverified webhook body prove nothing.
 *
 * There is intentionally no function that marks a transaction paid by hand.
 */
import { fromMajorUnits } from "./money.ts";
import type { PlanAudience } from "./plans.ts";

export type TransactionStatus = "initiated" | "pending" | "successful" | "failed" | "reversed" | "mismatch";

export type PaymentEnvironment = "test" | "live" | "simulator";

export type PaymentTransaction = {
  readonly id: string;
  /** Sonara's reference, sent to the provider as tx_ref. Unique. */
  readonly txRef: string;
  readonly userId: string;
  readonly planId: string;
  readonly audience: PlanAudience;
  readonly purpose: "new" | "renewal";
  /** Expected amount in minor units, after any promotion. */
  readonly amount: number;
  readonly currency: string;
  readonly promoCodeId: string | null;
  readonly status: TransactionStatus;
  readonly provider: "flutterwave";
  readonly environment: PaymentEnvironment;
  readonly providerTransactionId: string | null;
  readonly providerRef: string | null;
  readonly paymentType: string | null;
  /** What the provider says it charged, minor units. */
  readonly chargedAmount: number | null;
  readonly overpaid: boolean;
  readonly failureReason: string | null;
  readonly verifiedAt: string | null;
  readonly subscriptionId: string | null;
  readonly refundStatus: "none" | "requested" | "processing" | "refunded" | "rejected";
  /** Flutterwave's own tx_ref, for recurring card charges it initiates (not a Sonara SON- reference). */
  readonly providerTxRef?: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};

/** The fields Sonara reads from a provider verification response. */
export type VerifiedProviderTransaction = {
  readonly id: string;
  readonly txRef: string;
  readonly providerRef: string | null;
  readonly status: string;
  /** Decimal major units, as the provider returns it. */
  readonly amount: number;
  readonly chargedAmount: number | null;
  readonly currency: string;
  readonly paymentType: string | null;
  readonly customerEmail: string | null;
};

export type VerificationOutcome = {
  readonly status: Exclude<TransactionStatus, "initiated">;
  readonly reasons: readonly string[];
  readonly overpaid: boolean;
  readonly chargedMinor: number | null;
};

export function evaluateVerification(expected: Pick<PaymentTransaction, "txRef" | "amount" | "currency">, verified: VerifiedProviderTransaction): VerificationOutcome {
  const reasons: string[] = [];
  if (verified.txRef !== expected.txRef) reasons.push(`reference mismatch (expected ${expected.txRef}, provider returned ${verified.txRef})`);
  if (verified.currency !== expected.currency) reasons.push(`currency mismatch (expected ${expected.currency}, provider returned ${verified.currency})`);

  let paidMinor: number | null = null;
  if (verified.currency === expected.currency) {
    try {
      paidMinor = fromMajorUnits(verified.amount, verified.currency);
    } catch {
      reasons.push("unsupported currency");
    }
  }
  const chargedMinor = verified.chargedAmount !== null && verified.currency === expected.currency ? safeMinor(verified.chargedAmount, verified.currency) : paidMinor;

  const status = verified.status.toLowerCase();
  if (reasons.length > 0) return { status: "mismatch", reasons, overpaid: false, chargedMinor };
  if (status === "successful") {
    if (paidMinor === null || paidMinor < expected.amount) {
      return { status: "mismatch", reasons: [`amount too low (expected ${expected.amount}, provider returned ${paidMinor})`], overpaid: false, chargedMinor };
    }
    return { status: "successful", reasons: [], overpaid: paidMinor > expected.amount, chargedMinor };
  }
  if (status === "failed" || status === "cancelled") return { status: "failed", reasons: [`provider status ${status}`], overpaid: false, chargedMinor };
  if (status === "reversed" || status === "refunded") return { status: "reversed", reasons: [`provider status ${status}`], overpaid: false, chargedMinor };
  return { status: "pending", reasons: [`provider status ${status || "unknown"}`], overpaid: false, chargedMinor };
}

function safeMinor(amount: number, currency: string): number | null {
  try {
    return fromMajorUnits(amount, currency);
  } catch {
    return null;
  }
}

/** Allowed status moves. A successful payment can only be reversed, never "failed" afterwards. */
const NEXT: Record<TransactionStatus, readonly TransactionStatus[]> = {
  initiated: ["pending", "successful", "failed", "mismatch"],
  pending: ["pending", "successful", "failed", "mismatch"],
  successful: ["reversed"],
  failed: ["successful", "mismatch"],
  mismatch: [],
  reversed: [],
};

export const canMoveTransaction = (from: TransactionStatus, to: TransactionStatus): boolean => from === to || NEXT[from].includes(to);

export function newTxRef(randomHex: string): string {
  if (!/^[a-f0-9]{16,64}$/.test(randomHex)) throw new Error("tx ref entropy must be hex");
  return `SON-${randomHex.slice(0, 24).toUpperCase()}`;
}
