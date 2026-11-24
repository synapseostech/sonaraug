import { authorised, simTransaction, simulatorAvailable } from "../../../../../../../../lib/server/flutterwave-sim.ts";
import { json } from "../../../../../../../../lib/server/http.ts";

/** Simulated GET /v3/transactions/{id}/verify. Development only. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await simulatorAvailable())) return new Response("Not found", { status: 404 });
  if (!authorised(request)) return json({ status: "error", message: "Invalid authorization key", data: null }, 401);
  const { id } = await context.params;
  const tx = await simTransaction(id);
  if (!tx) return json({ status: "error", message: "No transaction was found for this id", data: null }, 400);
  return json({
    status: "success",
    message: "Transaction fetched successfully",
    data: { id: tx.id, tx_ref: tx.txRef, flw_ref: tx.flwRef, amount: tx.amount, currency: tx.currency, charged_amount: tx.chargedAmount, status: tx.status, payment_type: tx.paymentType, created_at: tx.createdAt, customer: { email: tx.customerEmail } },
  });
}
