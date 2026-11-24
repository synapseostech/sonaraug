/**
 * Which payment backend is active. Server only; nothing here reaches the browser
 * except `publicPaymentStatus()`, which never includes a key.
 *
 *   simulator           — DEVELOPMENT ONLY. A local stand-in for Flutterwave's API
 *                         (/api/dev/flutterwave-sim) so the full checkout → webhook →
 *                         verification path can run without credentials. No money moves.
 *   flutterwave (test)  — Flutterwave with test keys (FLW_ENVIRONMENT=test).
 *   flutterwave (live)  — refused unless FLW_ENVIRONMENT=live AND FLW_LIVE_APPROVED=yes AND
 *                         the admin setting billing.live_payments_enabled is on. Not to be
 *                         enabled until the owner approves and Flutterwave KYC is complete.
 *   unconfigured        — checkout is disabled with an explanation.
 */
import { describeKey, FLUTTERWAVE_API_BASE, type FlutterwaveConfig } from "@kito/billing/flutterwave";
import { appUrl } from "./notify.ts";
import type { PlatformSettings } from "./types.ts";

export type PaymentMode = "simulator" | "flutterwave_test" | "flutterwave_live" | "unconfigured";

export const SIMULATOR_SECRET_KEY = "SIMULATOR-NOT-A-REAL-KEY";
export const SIMULATOR_WEBHOOK_HASH = "sonara-local-simulator-webhook-hash";

const isProduction = () => process.env.NODE_ENV === "production" && process.env.SONARA_ALLOW_DEV_BACKEND !== "1";

export function paymentMode(settings: Pick<PlatformSettings, "livePaymentsEnabled">): PaymentMode {
  const requested = process.env.SONARA_PAYMENTS_MODE;
  const secret = process.env.FLW_SECRET_KEY;
  const hash = process.env.FLW_WEBHOOK_SECRET_HASH;
  if (requested === "flutterwave" || (!requested && secret)) {
    if (!secret || !hash) return "unconfigured";
    const env = process.env.FLW_ENVIRONMENT === "live" ? "live" : "test";
    if (env === "live") {
      return process.env.FLW_LIVE_APPROVED === "yes" && settings.livePaymentsEnabled ? "flutterwave_live" : "unconfigured";
    }
    return "flutterwave_test";
  }
  if (requested === "simulator" || !requested) return isProduction() ? "unconfigured" : "simulator";
  return "unconfigured";
}

export const simulatorEnabled = (settings: Pick<PlatformSettings, "livePaymentsEnabled">): boolean => paymentMode(settings) === "simulator";

export function flutterwaveConfig(mode: PaymentMode): FlutterwaveConfig | null {
  switch (mode) {
    case "simulator":
      return { secretKey: SIMULATOR_SECRET_KEY, baseUrl: `${appUrl()}/api/dev/flutterwave-sim` };
    case "flutterwave_test":
    case "flutterwave_live":
      return { secretKey: process.env.FLW_SECRET_KEY!, baseUrl: process.env.FLW_API_BASE || FLUTTERWAVE_API_BASE };
    default:
      return null;
  }
}

export function webhookSecretHash(mode: PaymentMode): string | null {
  if (mode === "simulator") return SIMULATOR_WEBHOOK_HASH;
  if (mode === "flutterwave_test" || mode === "flutterwave_live") return process.env.FLW_WEBHOOK_SECRET_HASH ?? null;
  return null;
}

export const environmentOf = (mode: PaymentMode): "test" | "live" | "simulator" => (mode === "flutterwave_live" ? "live" : mode === "simulator" ? "simulator" : "test");

export function publicPaymentStatus(settings: Pick<PlatformSettings, "livePaymentsEnabled">) {
  const mode = paymentMode(settings);
  const label: Record<PaymentMode, string> = {
    simulator: "Local payment simulator — no real money moves",
    flutterwave_test: "Flutterwave test mode — test cards and numbers only",
    flutterwave_live: "Flutterwave live payments",
    unconfigured: "Payments are not configured",
  };
  return { mode, label: label[mode], acceptsPayments: mode !== "unconfigured" };
}

/** For the admin settings page: presence only, never values. */
export function credentialReport() {
  return {
    FLW_PUBLIC_KEY: describeKey(process.env.FLW_PUBLIC_KEY),
    FLW_SECRET_KEY: describeKey(process.env.FLW_SECRET_KEY),
    FLW_WEBHOOK_SECRET_HASH: describeKey(process.env.FLW_WEBHOOK_SECRET_HASH),
    FLW_ENVIRONMENT: process.env.FLW_ENVIRONMENT || "not set (test)",
    FLW_LIVE_APPROVED: process.env.FLW_LIVE_APPROVED === "yes" ? "yes" : "no",
    SONARA_PAYMENTS_MODE: process.env.SONARA_PAYMENTS_MODE || "not set",
    SONARA_APP_URL: appUrl(),
  };
}
