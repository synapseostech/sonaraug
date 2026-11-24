/**
 * Money is an integer count of minor units with an ISO 4217 code. UGX has no
 * minor unit (exponent 0), so 15,000 UGX is stored as 15000. Floats never touch
 * an amount.
 */

export const CURRENCY_EXPONENT: Readonly<Record<string, number>> = Object.freeze({
  UGX: 0,
  KES: 2,
  TZS: 2,
  RWF: 0,
  USD: 2,
});

export const SUPPORTED_CURRENCIES = Object.keys(CURRENCY_EXPONENT);

export type Money = { readonly amount: number; readonly currency: string };

export function assertMoney(money: Money): void {
  if (!Number.isSafeInteger(money.amount) || money.amount < 0) throw new Error("Amount must be a non-negative integer of minor units");
  if (!(money.currency in CURRENCY_EXPONENT)) throw new Error(`Unsupported currency ${money.currency}`);
}

/** Converts minor units to the decimal major amount a payment API expects. */
export function toMajorUnits(money: Money): number {
  assertMoney(money);
  const exponent = CURRENCY_EXPONENT[money.currency] ?? 0;
  return money.amount / 10 ** exponent;
}

/** Converts a provider's decimal amount back to minor units, rounding half away from zero. */
export function fromMajorUnits(amount: number, currency: string): number {
  const exponent = CURRENCY_EXPONENT[currency];
  if (exponent === undefined) throw new Error(`Unsupported currency ${currency}`);
  return Math.round(amount * 10 ** exponent);
}

export function formatMoney(money: Money, locale = "en-UG"): string {
  const exponent = CURRENCY_EXPONENT[money.currency] ?? 0;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: money.currency,
    minimumFractionDigits: exponent,
    maximumFractionDigits: exponent,
  }).format(money.amount / 10 ** exponent);
}
