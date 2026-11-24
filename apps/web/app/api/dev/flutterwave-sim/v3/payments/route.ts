import { authorised, createSimCheckout, simulatorAvailable } from "../../../../../../lib/server/flutterwave-sim.ts";
import { json } from "../../../../../../lib/server/http.ts";

/** Simulated POST /v3/payments (Flutterwave Standard). Development only. */
export async function POST(request: Request) {
  if (!(await simulatorAvailable())) return new Response("Not found", { status: 404 });
  if (!authorised(request)) return json({ status: "error", message: "Invalid authorization key", data: null }, 401);
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const checkout = body ? await createSimCheckout(body) : null;
  if (!checkout) return json({ status: "error", message: "Invalid request", data: null }, 400);
  return json({ status: "success", message: "Hosted Link", data: { link: checkout.link } });
}
