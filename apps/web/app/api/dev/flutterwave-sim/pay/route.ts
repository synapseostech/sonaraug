import { completeSimPayment, simulatorAvailable, type SimOutcome } from "../../../../../lib/server/flutterwave-sim.ts";
import { isSameOrigin } from "../../../../../lib/server/http.ts";

const OUTCOMES: readonly SimOutcome[] = ["successful", "failed", "underpaid", "wrong_currency", "abandoned"];

/**
 * DEVELOPMENT ONLY. Completes a simulated payment and sends the browser back to
 * Sonara with a top-level 303 redirect, exactly as Flutterwave's hosted page does.
 */
export async function POST(request: Request) {
  if (!(await simulatorAvailable())) return new Response("Not found", { status: 404 });
  if (!isSameOrigin(request)) return new Response("Forbidden", { status: 403 });
  const form = await request.formData();
  const outcome = String(form.get("outcome") ?? "successful") as SimOutcome;
  if (!OUTCOMES.includes(outcome)) return new Response("Bad outcome", { status: 400 });
  const method = form.get("method") === "card" ? "card" : "mobilemoneyuganda";
  try {
    const to = await completeSimPayment(String(form.get("ref") ?? ""), outcome, method, { sendWebhook: form.get("webhook") === "on", duplicateWebhook: form.get("duplicate") === "on" });
    return new Response(null, { status: 303, headers: { Location: to, "Cache-Control": "no-store" } });
  } catch {
    return new Response("Unknown simulated checkout", { status: 404 });
  }
}
