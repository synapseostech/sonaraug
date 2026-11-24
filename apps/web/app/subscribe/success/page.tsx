import Link from "next/link";
import { formatMoney } from "@kito/billing";
import { KeyValues, Notice, PageHeader, Panel, formatDate } from "../../../components/sonara/ui.tsx";
import { requireViewer } from "../../../lib/server/auth.ts";
import { read } from "../../../lib/server/store.ts";

export const metadata = { title: "Payment received" };

/** Shows the server's verified record. The redirect's own query string decides nothing. */
export default async function SuccessPage({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const { ref } = await searchParams;
  const viewer = await requireViewer(`/subscribe/success${ref ? `?ref=${ref}` : ""}`);
  const data = await read();
  const tx = data.transactions.find((t) => t.txRef === ref && t.userId === viewer.id);
  const plan = tx ? data.plans.find((p) => p.id === tx.planId) : null;
  const sub = tx?.subscriptionId ? data.subscriptions.find((s) => s.id === tx.subscriptionId) : null;
  if (!tx) {
    return (
      <div className="sn-stack">
        <PageHeader title="Payment not found" description="We could not find that payment on your account." />
        <Link className="kt-btn kt-btn--primary" href="/account/payment-history">
          Payment history
        </Link>
      </div>
    );
  }
  if (tx.status !== "successful") {
    return (
      <div className="sn-stack" style={{ maxWidth: 640 }}>
        <PageHeader title="We are confirming your payment" description="Flutterwave has not confirmed this payment to us yet. This page updates when you reload it; you will also get a notification." />
        <Notice tone="warn">Status: {tx.status}. Premium access starts only after the payment is verified.</Notice>
        <div className="sn-row">
          <Link className="kt-btn kt-btn--secondary" href={`/subscribe/success?ref=${tx.txRef}`}>
            Check again
          </Link>
          <Link className="kt-btn kt-btn--ghost" href="/account/payment-history">
            Payment history
          </Link>
        </div>
      </div>
    );
  }
  return (
    <div className="sn-stack" style={{ maxWidth: 640 }}>
      <PageHeader title="You are subscribed" description="Your payment was verified with Flutterwave and your access is active." />
      {tx.environment !== "live" ? <Notice tone="warn">This was a {tx.environment === "simulator" ? "simulated" : "test-mode"} payment. No real money moved.</Notice> : null}
      <Panel title="Receipt">
        <KeyValues
          items={[
            ["Plan", plan?.name ?? tx.planId],
            ["Amount", formatMoney({ amount: tx.amount, currency: tx.currency })],
            ["Reference", <span key="r" className="sn-mono">{tx.txRef}</span>],
            ["Method", tx.paymentType ?? "—"],
            ["Access until", formatDate(sub?.currentPeriodEnd)],
          ]}
        />
      </Panel>
      <div className="sn-row">
        <Link className="kt-btn kt-btn--primary" href="/medical-chronicles">
          Start listening
        </Link>
        <Link className="kt-btn kt-btn--ghost" href="/account/subscriptions">
          Manage subscription
        </Link>
      </div>
    </div>
  );
}
