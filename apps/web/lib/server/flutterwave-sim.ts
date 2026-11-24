/**
 * LOCAL FLUTTERWAVE SIMULATOR — DEVELOPMENT ONLY. NO MONEY MOVES.
 *
 * Plays the provider's role so Sonara's real integration code (hosted checkout
 * → redirect → webhook with verif-hash → GET /v3/transactions/{id}/verify) can
 * be exercised without credentials. It keeps its own file, separate from the
 * Sonara store, exactly as a real provider would hold its own records.
 * Every route returns 404 unless the payment mode is "simulator", which is never
 * the case in production.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { asService, readData, scope } from "./data.ts";
import { dataDirectory } from "./store.ts";
import { SIMULATOR_SECRET_KEY, SIMULATOR_WEBHOOK_HASH, simulatorEnabled } from "./payments-config.ts";
import { appUrl } from "./notify.ts";

export type SimCheckout = {
  link: string;
  txRef: string;
  amount: number;
  currency: string;
  redirectUrl: string;
  customerEmail: string;
  description: string;
  paymentOptions: string;
  paymentPlan: string | null;
  createdAt: string;
};

export type SimTransaction = {
  id: number;
  txRef: string;
  flwRef: string;
  amount: number;
  chargedAmount: number;
  currency: string;
  status: "successful" | "failed" | "pending";
  paymentType: string;
  customerEmail: string;
  createdAt: string;
};

type SimData = { checkouts: Record<string, SimCheckout>; transactions: Record<string, SimTransaction>; nextId: number; plans: Record<string, { name: string; amount: number; currency: string; interval: string }> };

const FILE = () => path.join(dataDirectory(), "flutterwave-simulator.json");

async function load(): Promise<SimData> {
  try {
    return JSON.parse(await fs.readFile(FILE(), "utf8")) as SimData;
  } catch {
    return { checkouts: {}, transactions: {}, nextId: 900_000_001, plans: {} };
  }
}

async function save(data: SimData): Promise<void> {
  await fs.mkdir(dataDirectory(), { recursive: true, mode: 0o700 });
  const tmp = `${FILE()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data), { mode: 0o600 });
  await fs.rename(tmp, FILE());
}

export async function simulatorAvailable(): Promise<boolean> {
  if (process.env.NODE_ENV === "production" && process.env.SONARA_ALLOW_DEV_BACKEND !== "1") return false;
  const data = await readData(scope(asService("simulator availability"), {}));
  return simulatorEnabled(data.settings);
}

export function authorised(request: Request): boolean {
  return request.headers.get("authorization") === `Bearer ${SIMULATOR_SECRET_KEY}`;
}

export async function createSimCheckout(body: Record<string, unknown>): Promise<SimCheckout | null> {
  const txRef = typeof body.tx_ref === "string" ? body.tx_ref : "";
  const amount = typeof body.amount === "number" ? body.amount : Number.NaN;
  const redirectUrl = typeof body.redirect_url === "string" ? body.redirect_url : "";
  const customer = (body.customer ?? {}) as Record<string, unknown>;
  if (!txRef || !Number.isFinite(amount) || !redirectUrl.startsWith(appUrl())) return null;
  const data = await load();
  const checkout: SimCheckout = {
    link: `${appUrl()}/dev/flutterwave-sim/pay?ref=${encodeURIComponent(txRef)}`,
    txRef,
    amount,
    currency: String(body.currency ?? "NGN"),
    redirectUrl,
    customerEmail: String(customer.email ?? ""),
    description: String((body.customizations as Record<string, unknown> | undefined)?.description ?? ""),
    paymentOptions: String(body.payment_options ?? ""),
    paymentPlan: body.payment_plan ? String(body.payment_plan) : null,
    createdAt: new Date().toISOString(),
  };
  data.checkouts[txRef] = checkout;
  await save(data);
  return checkout;
}

export async function simCheckout(txRef: string): Promise<SimCheckout | null> {
  return (await load()).checkouts[txRef] ?? null;
}

export type SimOutcome = "successful" | "failed" | "underpaid" | "wrong_currency" | "abandoned";

/** Completes a simulated payment, fires the webhook, and returns the redirect URL. */
export async function completeSimPayment(txRef: string, outcome: SimOutcome, method: "card" | "mobilemoneyuganda", opts: { sendWebhook: boolean; duplicateWebhook: boolean }): Promise<string> {
  const data = await load();
  const checkout = data.checkouts[txRef];
  if (!checkout) throw new Error("Unknown simulated checkout");
  if (outcome === "abandoned") return `${checkout.redirectUrl}?status=cancelled&tx_ref=${encodeURIComponent(txRef)}`;
  const id = data.nextId++;
  const amount = outcome === "underpaid" ? Math.max(1, Math.floor(checkout.amount / 2)) : checkout.amount;
  const tx: SimTransaction = {
    id,
    txRef,
    flwRef: `SIM-FLW-${id}`,
    amount,
    chargedAmount: amount,
    currency: outcome === "wrong_currency" ? (checkout.currency === "UGX" ? "KES" : "UGX") : checkout.currency,
    status: outcome === "failed" ? "failed" : "successful",
    paymentType: method,
    customerEmail: checkout.customerEmail,
    createdAt: new Date().toISOString(),
  };
  data.transactions[String(id)] = tx;
  await save(data);

  if (opts.sendWebhook) {
    const payload = JSON.stringify({
      event: "charge.completed",
      data: { id, tx_ref: txRef, flw_ref: tx.flwRef, amount: tx.amount, currency: tx.currency, charged_amount: tx.chargedAmount, status: tx.status, payment_type: method, created_at: tx.createdAt, customer: { email: tx.customerEmail } },
    });
    const send = () =>
      fetch(`${appUrl()}/api/payments/flutterwave/webhook`, { method: "POST", headers: { "Content-Type": "application/json", "verif-hash": SIMULATOR_WEBHOOK_HASH }, body: payload }).catch(() => undefined);
    await send();
    if (opts.duplicateWebhook) await send();
  }
  const status = tx.status === "successful" ? "successful" : "failed";
  return `${checkout.redirectUrl}?status=${status}&tx_ref=${encodeURIComponent(txRef)}&transaction_id=${id}`;
}

export async function simTransaction(id: string): Promise<SimTransaction | null> {
  return (await load()).transactions[id] ?? null;
}

export async function createSimPlan(body: Record<string, unknown>): Promise<string> {
  const data = await load();
  const id = String(data.nextId++);
  data.plans[id] = { name: String(body.name ?? ""), amount: Number(body.amount ?? 0), currency: String(body.currency ?? "NGN"), interval: String(body.interval ?? "") };
  await save(data);
  return id;
}

/** Sends a forged webhook (wrong hash) so the rejection path can be seen working. */
export async function sendForgedWebhook(): Promise<number> {
  const response = await fetch(`${appUrl()}/api/payments/flutterwave/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "verif-hash": "forged-value-not-the-secret" },
    body: JSON.stringify({ event: "charge.completed", data: { id: 1, tx_ref: "SON-0000000000000000", status: "successful", amount: 1, currency: "UGX" } }),
  });
  return response.status;
}
