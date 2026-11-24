import { handleFlutterwaveWebhook } from "../../../../../lib/server/billing.ts";

/**
 * Flutterwave webhook endpoint. Authenticity: the `verif-hash` header must equal
 * the dashboard secret hash (constant-time compare). The body is never trusted:
 * every charge is re-verified with GET /v3/transactions/{id}/verify before any
 * access changes. Duplicate deliveries are acknowledged without reprocessing.
 */
export async function POST(request: Request) {
  const raw = await request.text();
  const result = await handleFlutterwaveWebhook(raw, request.headers.get("verif-hash"));
  return new Response(result.body, { status: result.httpStatus, headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" } });
}
