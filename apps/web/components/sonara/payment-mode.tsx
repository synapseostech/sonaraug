import { Notice } from "./ui.tsx";
import { publicPaymentStatus } from "../../lib/server/payments-config.ts";
import { read } from "../../lib/server/store.ts";

/** States plainly which payment backend is active. Shown wherever money is mentioned. */
export async function PaymentModeNotice() {
  const { settings } = await read();
  const status = publicPaymentStatus(settings);
  if (status.mode === "flutterwave_live") return null;
  if (status.mode === "unconfigured") {
    return <Notice tone="danger" title="Payments are not configured">Checkout is unavailable on this deployment. No payment can be taken.</Notice>;
  }
  return (
    <Notice tone="warn" title={status.label}>
      {status.mode === "simulator"
        ? "This development build uses Sonara's local Flutterwave simulator. It exercises the real checkout, webhook and verification code, but no money moves and nothing is sent to Flutterwave."
        : "Flutterwave test mode: use Flutterwave's test cards and numbers. No real money moves."}
    </Notice>
  );
}
