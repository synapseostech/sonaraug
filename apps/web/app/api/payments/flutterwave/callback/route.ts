import { redirect } from "next/navigation";
import { confirmTransaction } from "../../../../../lib/server/billing.ts";
import { read } from "../../../../../lib/server/store.ts";

/**
 * Where Flutterwave sends the browser after checkout. The query string
 * (status, tx_ref, transaction_id) is only a hint: the outcome shown comes from
 * a server-side verification of transaction_id, never from `status`.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const providerId = params.get("transaction_id");
  const txRef = params.get("tx_ref") ?? "";
  const safeRef = /^SON-[A-F0-9]{16,48}$/.test(txRef) ? txRef : "";
  let status: string = "pending";
  if (providerId && /^\d{1,20}$/.test(providerId)) {
    try {
      const outcome = await confirmTransaction(providerId, "callback");
      status = outcome.status;
    } catch (error) {
      console.error(`[payments] callback verification failed: ${(error as Error).message}`);
      status = "pending";
    }
  } else if (safeRef) {
    const data = await read();
    status = data.transactions.find((t) => t.txRef === safeRef)?.status ?? "pending";
    if (params.get("status") === "cancelled" || params.get("status") === "failed") status = status === "successful" ? status : "abandoned";
  }
  const query = safeRef ? `?ref=${encodeURIComponent(safeRef)}` : "";
  if (status === "successful") redirect(`/subscribe/success${query}`);
  redirect(`/subscribe/failed${query}${query ? "&" : "?"}state=${encodeURIComponent(status)}`);
}
