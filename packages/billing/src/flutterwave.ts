/**
 * Flutterwave integration boundary. SERVER ONLY (uses node:crypto and the secret key).
 *
 * Based on the official docs as read on 2026-11-23 (developer.flutterwave.com):
 *  - Hosted checkout: POST {base}/v3/payments → data.link
 *  - Verify:          GET  {base}/v3/transactions/{id}/verify
 *  - Payment plans:   POST {base}/v3/payment-plans (interval monthly|yearly|…)
 *  - Webhooks: header `verif-hash` must equal the secret hash set in the dashboard
 *    (a shared secret compared in constant time, not an HMAC). Return 200 quickly;
 *    Flutterwave retries failures. Always re-verify the transaction before giving value.
 *  - Recurring plans are card-only ("the payment method will automatically be fixed to card").
 *  - Uganda: currency UGX, payment_options "card, mobilemoneyuganda".
 *
 * Subscription management (2026-11-23): cancel/activate one subscription and
 * cancel/update a payment plan are VERIFIED against the API reference. Listing a
 * customer's subscriptions ("query all subscriptions") is NOT verified — see
 * listSubscriptions. Recurring charges arrive as charge.completed with
 * Flutterwave's own tx_ref and no plan or subscription id (see recurring.ts).
 *
 * `baseUrl` is injectable so the same code path can run against Sonara's local
 * simulator in development. The simulator is never a payment.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { toMajorUnits } from "./money.ts";
import type { BillingInterval } from "./plans.ts";
import type { VerifiedProviderTransaction } from "./transactions.ts";

export const FLUTTERWAVE_API_BASE = "https://api.flutterwave.com";

export type FlutterwaveConfig = {
  readonly secretKey: string;
  readonly baseUrl: string;
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
};

export class FlutterwaveError extends Error {
  readonly code: "network" | "timeout" | "http" | "provider" | "malformed";
  readonly httpStatus: number | null;
  constructor(code: FlutterwaveError["code"], message: string, httpStatus: number | null = null) {
    super(message);
    this.name = "FlutterwaveError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

async function call(config: FlutterwaveConfig, method: "GET" | "POST" | "PUT", path: string, body?: unknown): Promise<Record<string, unknown>> {
  const doFetch = config.fetch ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs ?? 15_000);
  let response: Response;
  try {
    response = await doFetch(`${config.baseUrl.replace(/\/$/, "")}${path}`, {
      method,
      headers: { Authorization: `Bearer ${config.secretKey}`, "Content-Type": "application/json", Accept: "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
      redirect: "error",
    });
  } catch (error) {
    // Never echo request details: they contain the Authorization header.
    if ((error as Error)?.name === "AbortError") throw new FlutterwaveError("timeout", `Flutterwave ${method} ${path} timed out`);
    throw new FlutterwaveError("network", `Flutterwave ${method} ${path} failed to connect`);
  } finally {
    clearTimeout(timer);
  }
  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new FlutterwaveError("malformed", `Flutterwave ${method} ${path} returned non-JSON (HTTP ${response.status})`, response.status);
  }
  const record = (json ?? {}) as Record<string, unknown>;
  if (!response.ok) {
    throw new FlutterwaveError("http", `Flutterwave ${method} ${path}: HTTP ${response.status} ${String(record.message ?? "").slice(0, 200)}`, response.status);
  }
  if (record.status !== "success") {
    throw new FlutterwaveError("provider", `Flutterwave ${method} ${path}: ${String(record.message ?? "unsuccessful response").slice(0, 200)}`, response.status);
  }
  return record;
}

export type HostedPaymentRequest = {
  txRef: string;
  /** Minor units; converted to the decimal amount Flutterwave expects. */
  amount: number;
  currency: string;
  redirectUrl: string;
  customer: { email: string; name?: string | null; phone?: string | null };
  title: string;
  description: string;
  logoUrl?: string | null;
  paymentOptions: string;
  /** Flutterwave payment plan id; forces card and creates a recurring subscription. */
  paymentPlanId?: string | null;
  meta?: Record<string, string>;
  sessionDurationMinutes?: number;
};

export async function createHostedPayment(config: FlutterwaveConfig, request: HostedPaymentRequest): Promise<{ link: string }> {
  const body: Record<string, unknown> = {
    tx_ref: request.txRef,
    amount: toMajorUnits({ amount: request.amount, currency: request.currency }),
    currency: request.currency,
    redirect_url: request.redirectUrl,
    customer: {
      email: request.customer.email,
      ...(request.customer.name ? { name: request.customer.name } : {}),
      ...(request.customer.phone ? { phonenumber: request.customer.phone } : {}),
    },
    customizations: { title: request.title, description: request.description, ...(request.logoUrl ? { logo: request.logoUrl } : {}) },
    payment_options: request.paymentOptions,
    meta: request.meta ?? {},
  };
  if (request.paymentPlanId) body.payment_plan = request.paymentPlanId;
  if (request.sessionDurationMinutes) body.session_duration = Math.min(request.sessionDurationMinutes, 1440);
  const result = await call(config, "POST", "/v3/payments", body);
  const link = (result.data as Record<string, unknown> | undefined)?.link;
  if (typeof link !== "string" || !/^https?:\/\//.test(link)) throw new FlutterwaveError("malformed", "Flutterwave did not return a checkout link");
  return { link };
}

function str(value: unknown): string | null {
  return typeof value === "string" ? value : typeof value === "number" ? String(value) : null;
}
function num(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(n) ? n : null;
}

/** Re-queries a transaction by Flutterwave's numeric id. The only source of truth for payment. */
export async function verifyTransaction(config: FlutterwaveConfig, providerTransactionId: string): Promise<VerifiedProviderTransaction> {
  if (!/^\d{1,20}$/.test(providerTransactionId)) throw new FlutterwaveError("malformed", "Transaction id must be numeric");
  const result = await call(config, "GET", `/v3/transactions/${providerTransactionId}/verify`);
  const data = (result.data ?? null) as Record<string, unknown> | null;
  if (!data) throw new FlutterwaveError("malformed", "Verification response had no data");
  const id = str(data.id);
  const txRef = str(data.tx_ref);
  const amount = num(data.amount);
  const currency = str(data.currency);
  const status = str(data.status);
  if (!id || !txRef || amount === null || !currency || !status) throw new FlutterwaveError("malformed", "Verification response is missing required fields");
  const customer = (data.customer ?? {}) as Record<string, unknown>;
  return {
    id,
    txRef,
    providerRef: str(data.flw_ref),
    status,
    amount,
    chargedAmount: num(data.charged_amount),
    currency: currency.toUpperCase(),
    paymentType: str(data.payment_type),
    customerEmail: str(customer.email),
  };
}

const PLAN_INTERVAL: Record<BillingInterval, string> = { monthly: "monthly", annual: "yearly" };

export async function createPaymentPlan(config: FlutterwaveConfig, plan: { name: string; amount: number; currency: string; interval: BillingInterval }): Promise<{ id: string }> {
  const result = await call(config, "POST", "/v3/payment-plans", {
    name: plan.name,
    amount: toMajorUnits({ amount: plan.amount, currency: plan.currency }),
    currency: plan.currency,
    interval: PLAN_INTERVAL[plan.interval],
  });
  const id = str((result.data as Record<string, unknown> | undefined)?.id);
  if (!id) throw new FlutterwaveError("malformed", "Payment plan response had no id");
  return { id };
}

/**
 * Cancels ONE customer's subscription (not the whole payment plan).
 * VERIFIED against the API reference "Deactivate a subscription" (2026-11-23):
 * PUT /v3/subscriptions/{id}/cancel, where id is the subscription's data.id from
 * the "query all subscriptions" call. No request body.
 */
export async function cancelSubscription(config: FlutterwaveConfig, providerSubscriptionId: string): Promise<{ status: string | null }> {
  if (!/^\d{1,20}$/.test(providerSubscriptionId)) throw new FlutterwaveError("malformed", "Subscription id must be numeric");
  const result = await call(config, "PUT", `/v3/subscriptions/${providerSubscriptionId}/cancel`);
  return { status: str((result.data as Record<string, unknown> | undefined)?.status) };
}

/** Re-activates a previously cancelled subscription (verified: PUT /v3/subscriptions/{id}/activate). */
export async function activateSubscription(config: FlutterwaveConfig, providerSubscriptionId: string): Promise<void> {
  if (!/^\d{1,20}$/.test(providerSubscriptionId)) throw new FlutterwaveError("malformed", "Subscription id must be numeric");
  await call(config, "PUT", `/v3/subscriptions/${providerSubscriptionId}/activate`);
}

export type ProviderSubscription = { id: string; planId: string | null; status: string; customerEmail: string | null; amount: number | null; createdAt: string | null };

/**
 * Lists a customer's subscriptions to find the id needed for cancellation.
 * UNVERIFIED: the "Get all subscriptions" reference page could not be read; the
 * path and the email/plan query parameters follow the v3 convention and MUST be
 * confirmed in sandbox (docs/SONARA_FLUTTERWAVE_INTEGRATION.md §8). Callers treat
 * a failure as "id unknown" and escalate to staff rather than assume cancellation.
 */
export async function listSubscriptions(config: FlutterwaveConfig, filter: { email: string; planId?: string | null }): Promise<ProviderSubscription[]> {
  const params = new URLSearchParams({ email: filter.email });
  if (filter.planId) params.set("plan", filter.planId);
  const result = await call(config, "GET", `/v3/subscriptions?${params}`);
  const rows = Array.isArray(result.data) ? (result.data as Record<string, unknown>[]) : [];
  return rows.map((r) => {
    const customer = (r.customer ?? {}) as Record<string, unknown>;
    const plan = r.plan;
    return {
      id: str(r.id) ?? "",
      planId: typeof plan === "object" && plan ? str((plan as Record<string, unknown>).id) : str(plan),
      status: str(r.status) ?? "",
      customerEmail: str(customer.customer_email ?? customer.email),
      amount: num(r.amount),
      createdAt: str(r.created_at),
    };
  });
}

/** Cancels a whole payment plan (all its subscribers). Verified: PUT /v3/payment-plans/{id}/cancel. */
export async function cancelPaymentPlan(config: FlutterwaveConfig, planId: string): Promise<void> {
  if (!/^\d{1,20}$/.test(planId)) throw new FlutterwaveError("malformed", "Plan id must be numeric");
  await call(config, "PUT", `/v3/payment-plans/${planId}/cancel`);
}

/** Renames or re-activates a payment plan. Verified: PUT /v3/payment-plans/{id} with { name, status }. */
export async function updatePaymentPlan(config: FlutterwaveConfig, planId: string, update: { name: string; status: "active" | "cancelled" }): Promise<void> {
  if (!/^\d{1,20}$/.test(planId)) throw new FlutterwaveError("malformed", "Plan id must be numeric");
  await call(config, "PUT", `/v3/payment-plans/${planId}`, update);
}

/* ------------------------------------------------------------------ webhooks */

/**
 * Constant-time comparison of the `verif-hash` header with the configured secret
 * hash. Both sides are hashed first so their lengths always match and the
 * comparison time reveals nothing about the secret.
 */
export function verifyWebhookHash(headerValue: string | null | undefined, secretHash: string | null | undefined): boolean {
  if (!secretHash || secretHash.length < 16) return false; // refuse to run with a missing or trivial secret
  if (typeof headerValue !== "string" || headerValue.length === 0) return false;
  const a = createHash("sha256").update(headerValue, "utf8").digest();
  const b = createHash("sha256").update(secretHash, "utf8").digest();
  return timingSafeEqual(a, b);
}

export type WebhookEvent = {
  readonly event: string;
  readonly providerTransactionId: string | null;
  readonly txRef: string | null;
  readonly status: string | null;
  readonly amount: number | null;
  readonly currency: string | null;
  readonly customerEmail: string | null;
  readonly planId: string | null;
  readonly raw: Record<string, unknown>;
};

/** Parses a webhook body. Accepts `event` or `event.type` (both appear in the docs' samples). */
export function parseWebhook(body: string): WebhookEvent | null {
  if (body.length > 256 * 1024) return null;
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return null;
  }
  if (!json || typeof json !== "object") return null;
  const record = json as Record<string, unknown>;
  const event = str(record.event) ?? str(record["event.type"]);
  const data = (record.data ?? null) as Record<string, unknown> | null;
  if (!event || !data || typeof data !== "object") return null;
  const customer = (data.customer ?? {}) as Record<string, unknown>;
  const plan = (data.plan ?? {}) as Record<string, unknown>;
  return {
    event,
    providerTransactionId: str(data.id),
    txRef: str(data.tx_ref),
    status: str(data.status),
    amount: num(data.amount),
    currency: str(data.currency),
    customerEmail: str(customer.email),
    planId: str(plan.id),
    raw: record,
  };
}

/** Flutterwave's suggested idempotency key: one row per (event, transaction, status). */
export function webhookIdempotencyKey(event: WebhookEvent): string {
  const subject = event.providerTransactionId ?? `${event.customerEmail ?? "?"}:${event.planId ?? "?"}`;
  return `${event.event}:${subject}:${event.status ?? "?"}`;
}

/** Payment methods offered at checkout. Recurring plans are card-only on Flutterwave. */
export function paymentOptionsFor(currency: string, recurring: boolean): string {
  if (recurring) return "card";
  if (currency === "UGX") return "card, mobilemoneyuganda";
  return "card";
}

/** Safe description of a key for logs and admin UI: never the key itself. */
export function describeKey(key: string | null | undefined): string {
  if (!key) return "not set";
  return `set (${key.length} chars, ends …${key.slice(-4)})`;
}
