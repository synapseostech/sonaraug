import Link from "next/link";
import { formatMoney } from "@kito/billing";
import { KeyValues, PageHeader, Panel, formatDate } from "../../../components/sonara/ui.tsx";
import { PaymentModeNotice } from "../../../components/sonara/payment-mode.tsx";
import { requireViewer } from "../../../lib/server/auth.ts";
import { billingOverviewFor } from "../../../lib/server/billing.ts";

export const metadata = { title: "Billing" };

export default async function BillingPage() {
  const viewer = await requireViewer("/account/billing");
  const { subscriptions, transactions, refunds } = await billingOverviewFor(viewer);
  const live = subscriptions.find((s) => s.effective.grantsAccess);
  const last = transactions.find((t) => t.status === "successful");
  return (
    <>
      <PageHeader title="Billing" description="Payments are processed by Flutterwave. Sonara never stores card numbers, CVVs or mobile-money PINs." />
      <PaymentModeNotice />
      <Panel title="Billing status">
        <KeyValues
          items={[
            ["Current plan", live?.plan?.name ?? "None"],
            ["Renews", live ? (live.subscription.cancelAtPeriodEnd ? "No — ends at period end" : live.subscription.renewalMode === "card_auto" ? `Automatically on ${formatDate(live.subscription.currentPeriodEnd)}` : `You renew by ${formatDate(live.subscription.currentPeriodEnd)}`) : "—"],
            ["Last payment", last ? `${formatMoney({ amount: last.amount, currency: last.currency })} on ${formatDate(last.verifiedAt)}` : "—"],
            ["Saved payment method", "None stored by Sonara (card renewals are held by Flutterwave)"],
            ["Open refund requests", String(refunds.filter((r) => r.status === "requested" || r.status === "processing").length)],
          ]}
        />
        <div className="sn-row" style={{ marginTop: 12 }}>
          <Link className="kt-btn kt-btn--secondary kt-btn--sm" href="/account/payment-history">Payment history</Link>
          <Link className="kt-btn kt-btn--ghost kt-btn--sm" href="/subscribe/renewal">Renew</Link>
        </div>
      </Panel>
    </>
  );
}
