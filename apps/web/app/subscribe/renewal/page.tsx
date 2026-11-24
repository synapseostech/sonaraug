import Link from "next/link";
import { effectiveState, formatMoney, INTERVAL_LABEL } from "@kito/billing";
import { Empty, Notice, PageHeader, Panel, formatDate } from "../../../components/sonara/ui.tsx";
import { PaymentModeNotice } from "../../../components/sonara/payment-mode.tsx";
import { requireViewer } from "../../../lib/server/auth.ts";
import { read } from "../../../lib/server/store.ts";

export const metadata = { title: "Renew" };

/**
 * Explicit renewal for subscriptions that do not renew automatically (mobile
 * money, or cards without a recurring plan). Paying extends from the end of the
 * current period, so renewing early loses nothing.
 */
export default async function RenewalPage() {
  const viewer = await requireViewer("/subscribe/renewal");
  const data = await read();
  const now = new Date();
  const subs = data.subscriptions
    .filter((s) => s.userId === viewer.id && s.renewalMode === "manual")
    .map((s) => ({ s, eff: effectiveState(s, now, data.settings.graceDays), plan: data.plans.find((p) => p.id === s.planId) }))
    .filter((x) => x.eff.state !== "pending");
  return (
    <div className="sn-stack--lg" style={{ maxWidth: 820 }}>
      <PageHeader title="Renew your subscription" description="Mobile money cannot be charged automatically, so you renew each period here. Paying early adds a full period after your current one ends." />
      <PaymentModeNotice />
      {subs.length === 0 ? (
        <Empty title="Nothing to renew" action={<Link className="kt-btn kt-btn--primary" href="/subscribe/listener">See plans</Link>} />
      ) : (
        subs.map(({ s, eff, plan }) => (
          <Panel key={s.id} title={plan?.name ?? "Plan"} subtitle={plan ? `${formatMoney({ amount: plan.amount, currency: plan.currency })} ${INTERVAL_LABEL[plan.interval]}` : undefined}>
            <p className="sn-small">
              {eff.state === "expired" ? `Ended ${formatDate(s.currentPeriodEnd)}.` : `Current period ends ${formatDate(s.currentPeriodEnd)}.`}
              {eff.state === "grace" ? ` Grace access until ${formatDate(eff.accessUntil)}.` : ""}
            </p>
            {eff.state === "grace" ? <Notice tone="warn">Your renewal is overdue. Renew now to keep listening.</Notice> : null}
            {plan?.active ? (
              <Link className="kt-btn kt-btn--primary" href={`/subscribe/checkout?plan=${plan.id}`}>
                Renew for another {plan.interval === "annual" ? "year" : "month"}
              </Link>
            ) : (
              <p className="sn-small">This plan is no longer offered. <Link className="sn-link" href="/subscribe/listener">Choose a current plan</Link>.</p>
            )}
          </Panel>
        ))
      )}
    </div>
  );
}
