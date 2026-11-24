import Link from "next/link";
import { formatMoney, INTERVAL_LABEL, listenerEntitlement, type EffectiveState } from "@kito/billing";
import { ActionForm, SubmitButton } from "./forms.tsx";
import { Empty, KeyValues, Notice, Panel, Pill, formatDate } from "./ui.tsx";
import { cancelSubscriptionAction, resumeSubscriptionAction } from "../../app/subscribe/actions.ts";
import { billingOverviewFor } from "../../lib/server/billing.ts";
import type { Viewer } from "../../lib/server/auth.ts";

const STATE: Record<EffectiveState, { label: string; tone: "ok" | "warn" | "danger" | "neutral" | "info" }> = {
  active: { label: "Active", tone: "ok" },
  trial: { label: "Trial", tone: "info" },
  cancelling: { label: "Ends at period end", tone: "warn" },
  grace: { label: "Renewal overdue — grace period", tone: "warn" },
  pending: { label: "Awaiting payment", tone: "neutral" },
  expired: { label: "Expired", tone: "danger" },
};

const NOTICES: Record<string, { tone: "ok" | "warn"; text: string }> = {
  cancelled: { tone: "ok", text: "Your subscription will not renew. You keep premium access until the end of the period you paid for." },
  cancelled_unconfirmed: { tone: "warn", text: "Your subscription will not renew, and you keep access until the end of the paid period. We could not confirm the card cancellation with Flutterwave; our team has been alerted and will stop the renewal." },
  resumed: { tone: "ok", text: "Your subscription is active again." },
};

export async function SubscriptionsManager({ viewer, showCancelOnly = false, returnTo, notice }: { viewer: Viewer; showCancelOnly?: boolean; returnTo: string; notice?: string }) {
  const overview = await billingOverviewFor(viewer);
  const { subscriptions, overrides } = overview;
  // The overview already holds this viewer's subscriptions and overrides.
  const entitlement = listenerEntitlement(viewer.id, { subscriptions: subscriptions.map((s) => s.subscription), overrides }, new Date(), overview.settings.graceDays);
  const activeOverrides = overrides.filter((o) => !o.revokedAt && (!o.validUntil || Date.parse(o.validUntil) > Date.now()));
  const list = showCancelOnly ? subscriptions.filter((s) => s.effective.grantsAccess && !s.subscription.cancelAtPeriodEnd) : subscriptions;

  return (
    <div className="sn-stack">
      {notice && NOTICES[notice] ? <Notice tone={NOTICES[notice].tone}>{NOTICES[notice].text}</Notice> : null}
      <Panel title="Premium listening">
        <KeyValues
          items={[
            ["Status", entitlement.premium ? <Pill tone="ok">Premium</Pill> : <Pill>Free account</Pill>],
            ["Source", entitlement.source === "subscription" ? "Subscription" : entitlement.source === "override" ? "Granted by Sonara" : entitlement.source === "revoked" ? "Access suspended by Sonara" : "—"],
            ["Access until", entitlement.accessUntil ? formatDate(entitlement.accessUntil) : entitlement.premium ? "No end date" : "—"],
          ]}
        />
        {activeOverrides.length ? <p className="sn-small">Sonara has adjusted your access {activeOverrides.length} time(s). Contact support for details.</p> : null}
      </Panel>
      {list.length === 0 ? (
        <Empty title={showCancelOnly ? "Nothing to cancel" : "No subscriptions yet"} action={<Link className="kt-btn kt-btn--primary" href="/subscribe/listener">See plans</Link>}>
          {showCancelOnly ? "You have no subscription that is set to continue." : "Your subscriptions will appear here."}
        </Empty>
      ) : (
        list.map(({ subscription: s, plan, effective }) => (
          <Panel
            key={s.id}
            title={plan?.name ?? "Plan"}
            subtitle={plan ? `${formatMoney({ amount: plan.amount, currency: plan.currency })} ${INTERVAL_LABEL[plan.interval]} · ${s.audience} product` : undefined}
            actions={<Pill tone={STATE[effective.state].tone}>{STATE[effective.state].label}</Pill>}
          >
            <KeyValues
              items={[
                ["Started", formatDate(s.createdAt)],
                ["Current period", s.currentPeriodStart ? `${formatDate(s.currentPeriodStart)} – ${formatDate(s.currentPeriodEnd)}` : "—"],
                ["Renewal", s.renewalMode === "card_auto" ? (s.cancelAtPeriodEnd ? "Automatic card renewal stopped" : "Automatic card renewal") : "You renew each period (no automatic charge)"],
                ["Access until", formatDate(effective.accessUntil)],
              ]}
            />
            {effective.state === "grace" ? (
              <Notice tone="warn">
                Your period has ended. Access continues briefly while you renew. <Link className="sn-link" href="/subscribe/renewal">Renew now</Link>
              </Notice>
            ) : null}
            <div className="sn-row" style={{ marginTop: 12 }}>
              {effective.grantsAccess && !s.cancelAtPeriodEnd ? (
                <ActionForm action={cancelSubscriptionAction} className="sn-inline-form" confirm="Cancel this subscription? You keep access until the end of the paid period.">
                  <input type="hidden" name="subscriptionId" value={s.id} />
                  <input type="hidden" name="returnTo" value={returnTo} />
                  <SubmitButton variant="danger" pendingLabel="Cancelling…">
                    Cancel subscription
                  </SubmitButton>
                </ActionForm>
              ) : null}
              {s.cancelAtPeriodEnd && effective.grantsAccess ? (
                <ActionForm action={resumeSubscriptionAction} className="sn-inline-form">
                  <input type="hidden" name="subscriptionId" value={s.id} />
                  <input type="hidden" name="returnTo" value={returnTo} />
                  <SubmitButton variant="secondary">Keep my subscription</SubmitButton>
                </ActionForm>
              ) : null}
              {s.renewalMode === "manual" && !s.cancelAtPeriodEnd && plan ? (
                <Link className="kt-btn kt-btn--ghost" href={`/subscribe/checkout?plan=${plan.id}`}>
                  Renew early
                </Link>
              ) : null}
            </div>
          </Panel>
        ))
      )}
    </div>
  );
}
