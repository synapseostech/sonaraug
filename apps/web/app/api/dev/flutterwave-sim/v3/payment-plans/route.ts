import { authorised, createSimPlan, simulatorAvailable } from "../../../../../../lib/server/flutterwave-sim.ts";
import { json } from "../../../../../../lib/server/http.ts";

export async function POST(request: Request) {
  if (!(await simulatorAvailable())) return new Response("Not found", { status: 404 });
  if (!authorised(request)) return json({ status: "error", message: "Invalid authorization key", data: null }, 401);
  const body = ((await request.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
  const id = await createSimPlan(body);
  return json({ status: "success", message: "Payment plan created", data: { id: Number(id), name: body.name, amount: body.amount, interval: body.interval, status: "active" } });
}
