import Link from "next/link";
import { PageHeader, Notice } from "../../../components/sonara/ui.tsx";
import { PlanCard } from "../../../components/sonara/plans.tsx";
import { PaymentModeNotice } from "../../../components/sonara/payment-mode.tsx";
import { getViewer } from "../../../lib/server/auth.ts";
import { activePlans } from "../../../lib/server/billing.ts";
import { listenerEntitlementFor } from "../../../lib/server/entitlements.ts";
import { read } from "../../../lib/server/store.ts";
import { formatDate } from "../../../components/sonara/ui.tsx";

export const metadata = { title: "Listener plans" };

export default async function ListenerPlansPage() {
  const [plans, viewer, data] = await Promise.all([activePlans("listener"), getViewer(), read()]);
  const entitlement = viewer ? listenerEntitlementFor(data, viewer.id) : null;
  return (
    <div className="sn-stack--lg">
      <PageHeader title="Listener plans" description="Unlock every premium Medical Chronicles episode. Prices in Ugandan shillings." />
      <PaymentModeNotice />
      {entitlement?.premium ? (
        <Notice tone="ok" title="You already have premium access">
          {entitlement.source === "override" ? "Granted by Sonara" : "Active subscription"}
          {entitlement.accessUntil ? ` until ${formatDate(entitlement.accessUntil)}` : ""}. Paying again extends your access from the end of the current period.{" "}
          <Link className="sn-link" href="/account/subscriptions">
            Manage
          </Link>
        </Notice>
      ) : null}
      <div className="sn-plans">
        {plans.map((plan, i) => (
          <PlanCard key={plan.id} plan={plan} featured={i === 0} cta={{ href: `/subscribe/checkout?plan=${plan.id}`, label: entitlement?.premium ? "Extend with this plan" : "Choose plan" }} />
        ))}
      </div>
      <p className="sn-small">
        Card payments can renew automatically when the plan supports it. Mobile money is paid each period; we remind you before it ends. Cancel any time.
      </p>
    </div>
  );
}
