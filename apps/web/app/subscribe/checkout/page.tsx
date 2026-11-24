import Link from "next/link";
import { formatMoney, INTERVAL_LABEL } from "@kito/billing";
import { KeyValues, Notice, PageHeader, Panel } from "../../../components/sonara/ui.tsx";
import { PaymentModeNotice } from "../../../components/sonara/payment-mode.tsx";
import { requireViewer } from "../../../lib/server/auth.ts";
import { publicPaymentStatus } from "../../../lib/server/payments-config.ts";
import { read } from "../../../lib/server/store.ts";
import { CheckoutForm } from "./form.tsx";

export const metadata = { title: "Checkout" };

export default async function CheckoutPage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const { plan: planId } = await searchParams;
  const viewer = await requireViewer(`/subscribe/checkout?plan=${planId ?? ""}`);
  const data = await read();
  const plan = data.plans.find((p) => p.id === planId && p.active);
  if (!plan) {
    return (
      <div className="sn-stack">
        <PageHeader title="Choose a plan first" />
        <Link className="kt-btn kt-btn--primary" href="/subscribe/listener">
          See listener plans
        </Link>
      </div>
    );
  }
  const status = publicPaymentStatus(data.settings);
  const blocked = !viewer.emailVerified || !status.acceptsPayments || data.settings.maintenanceMode;
  return (
    <div className="sn-stack--lg" style={{ maxWidth: 720 }}>
      <PageHeader title="Checkout" description="You will complete payment on Flutterwave's secure page. Sonara never sees your card number or mobile-money PIN." />
      <PaymentModeNotice />
      {!viewer.emailVerified ? (
        <Notice tone="warn" title="Verify your email first">
          We need a verified address to send receipts. <Link className="sn-link" href="/auth/verify-email">Verify or resend the link</Link>.
        </Notice>
      ) : null}
      <Panel title="Order summary">
        <KeyValues
          items={[
            ["Plan", plan.name],
            ["Price", `${formatMoney({ amount: plan.amount, currency: plan.currency })} ${INTERVAL_LABEL[plan.interval]}`],
            ["Account", viewer.email],
            ["Access", plan.audience === "listener" ? "Premium Medical Chronicles listening" : "Creator publishing capacity"],
          ]}
        />
        {plan.priceIsPlaceholder ? <p className="sn-placeholder">This is a development price that has not been approved.</p> : null}
      </Panel>
      <Panel title="Payment">
        <CheckoutForm planId={plan.id} recurringAvailable={Boolean(plan.providerPlanId)} disabled={blocked} />
      </Panel>
    </div>
  );
}
