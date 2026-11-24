import { authorised, simulatorAvailable } from "../../../../../../../../lib/server/flutterwave-sim.ts";
import { json } from "../../../../../../../../lib/server/http.ts";

export async function PUT(request: Request) {
  if (!(await simulatorAvailable())) return new Response("Not found", { status: 404 });
  if (!authorised(request)) return json({ status: "error", message: "Invalid authorization key", data: null }, 401);
  return json({ status: "success", message: "Subscription cancelled", data: null });
}
