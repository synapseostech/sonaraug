import { staffCan } from "@kito/auth";
import { effectiveState, formatMoney, INTERVAL_LABEL } from "@kito/billing";
import { DataTable, Empty, Notice, PageHeader, Panel, Pill, formatDate } from "../../../components/sonara/ui.tsx";
import { requireStaff } from "../../../lib/server/auth.ts";
import { adminBilling } from "../../../lib/server/billing.ts";
import { paymentMode } from "../../../lib/server/payments-config.ts";
import { JobButtons, OverrideForm, PlanForm, PromoForm, ProviderPlanButton, RevokeOverrideForm } from "../forms.tsx";

export const metadata = { title: "Plans and subscriptions · Admin" };

export default async function AdminSubscriptionsPage({ searchParams }: { searchParams: Promise<{ edit?: string; state?: string }> }) {
  const viewer = await requireStaff("subscriptions:read", "/admin/subscriptions");
  const { edit, state } = await searchParams;
  const data = await adminBilling(viewer);
  const canPlans = staffCan(viewer.roles, "plans:manage");
  const canOverride = staffCan(viewer.roles, "subscriptions:override");
  const email = (id: string) => data.users.find((u) => u.id === id)?.email ?? id;
  const editing = data.plans.find((p) => p.id === edit);
  const subs = data.subscriptions
    .map((s) => ({ s, eff: effectiveState(s, data.now, data.settings.graceDays), plan: data.plans.find((p) => p.id === s.planId) }))
    .filter((x) => !state || x.eff.state === state || (state === "cancelled" && x.s.cancelAtPeriodEnd))
    .sort((a, b) => b.s.updatedAt.localeCompare(a.s.updatedAt));
  const mode = paymentMode(data.settings);
  return (
    <>
      <PageHeader title="Plans and subscriptions" description="Listener and creator plans are separate products. Prices marked as placeholders are not approved." />
      {data.plans.some((p) => p.priceIsPlaceholder && p.active) ? <Notice tone="warn" title="Placeholder prices are live in this build">Development prices are shown to customers with a notice. Approve real prices before launch.</Notice> : null}
      <Panel title="Plans">
        <DataTable
          caption="Plans"
          rows={[...data.plans].sort((a, b) => a.audience.localeCompare(b.audience) || a.sortOrder - b.sortOrder)}
          rowKey={(p) => p.id}
          columns={[
            { key: "n", header: "Plan", cell: (p) => <>{p.name} <span className="sn-small">({p.code})</span></> },
            { key: "a", header: "Product", cell: (p) => <Pill tone={p.audience === "listener" ? "accent" : "info"}>{p.audience}</Pill> },
            { key: "p", header: "Price", cell: (p) => <>{formatMoney({ amount: p.amount, currency: p.currency })} {INTERVAL_LABEL[p.interval]}{p.priceIsPlaceholder ? <span className="sn-placeholder"> · placeholder</span> : null}</> },
            { key: "s", header: "Offered", cell: (p) => (p.active ? <Pill tone="ok">Yes</Pill> : <Pill>No</Pill>) },
            { key: "r", header: "Card auto-renew", cell: (p) => (p.providerPlanId ? <span className="sn-mono">FLW {p.providerPlanId}</span> : canPlans && !p.priceIsPlaceholder && mode !== "unconfigured" ? <ProviderPlanButton planId={p.id} /> : "—") },
            { key: "e", header: "", cell: (p) => (canPlans ? <a className="sn-link" href={`/admin/subscriptions?edit=${p.id}#plan-form`}>Edit</a> : null) },
          ]}
        />
      </Panel>
      {canPlans ? (
        <Panel title={editing ? `Edit ${editing.name}` : "New plan"} id="plan-form">
          <PlanForm key={editing?.id ?? "new"} values={editing} />
        </Panel>
      ) : null}
      <Panel title="Subscriptions" actions={staffCan(viewer.roles, "payments:reconcile") ? <JobButtons simulator={false} /> : null}>
        <form className="sn-toolbar" aria-label="Filter subscriptions">
          <select className="ws-input ws-input--select" name="state" defaultValue={state ?? ""} aria-label="State">
            <option value="">All</option>
            {["active", "trial", "cancelling", "grace", "expired", "pending"].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button className="kt-btn kt-btn--secondary kt-btn--sm" type="submit">Filter</button>
        </form>
        <DataTable
          caption="Subscriptions"
          rows={subs}
          rowKey={(x) => x.s.id}
          empty={<Empty title="No subscriptions" />}
          columns={[
            { key: "u", header: "User", cell: (x) => <a className="sn-link" href={`/admin/users/${x.s.userId}`}>{email(x.s.userId)}</a> },
            { key: "p", header: "Plan", cell: (x) => x.plan?.name ?? x.s.planId },
            { key: "st", header: "State", cell: (x) => <Pill tone={x.eff.grantsAccess ? "ok" : "neutral"}>{x.eff.state}</Pill> },
            { key: "r", header: "Renewal", cell: (x) => (x.s.renewalMode === "card_auto" ? "Card auto" : "Manual") },
            { key: "e", header: "Period end", cell: (x) => formatDate(x.s.currentPeriodEnd) },
            { key: "pay", header: "Payments", numeric: true, cell: (x) => x.s.appliedTransactionIds.length },
          ]}
        />
      </Panel>
      <div className="sn-grid-2">
        {canOverride ? (
          <Panel title="Manual entitlement adjustment" subtitle="For complimentary access, partner pilots or suspensions. This never marks a payment as paid.">
            <OverrideForm creatorPlans={data.plans.filter((p) => p.audience === "creator").map((p) => ({ value: p.id, label: p.name }))} />
          </Panel>
        ) : null}
        <Panel title="Adjustments">
          <DataTable
            caption="Entitlement overrides"
            rows={[...data.overrides].reverse()}
            rowKey={(o) => o.id}
            empty={<Empty title="No adjustments" />}
            columns={[
              { key: "u", header: "User", cell: (o) => email(o.userId) },
              { key: "e", header: "Effect", cell: (o) => <Pill tone={o.effect === "grant" ? "ok" : "danger"}>{o.audience} {o.effect}</Pill> },
              { key: "t", header: "Until", cell: (o) => (o.revokedAt ? `revoked ${formatDate(o.revokedAt)}` : formatDate(o.validUntil) === "—" ? "no end" : formatDate(o.validUntil)) },
              { key: "r", header: "Reason", cell: (o) => o.reason },
              { key: "b", header: "By", cell: (o) => email(o.createdBy) },
              { key: "x", header: "", cell: (o) => (!o.revokedAt && canOverride ? <RevokeOverrideForm id={o.id} /> : null) },
            ]}
          />
        </Panel>
      </div>
      {canPlans ? (
        <div className="sn-grid-2">
          <Panel title="New promotional code">
            <PromoForm />
          </Panel>
          <Panel title="Promotional codes">
            <DataTable
              caption="Promotional codes"
              rows={data.promos}
              rowKey={(p) => p.id}
              empty={<Empty title="No codes" />}
              columns={[
                { key: "c", header: "Code", cell: (p) => <span className="sn-mono">{p.code}</span> },
                { key: "d", header: "Discount", cell: (p) => (p.percentOff ? `${p.percentOff}%` : formatMoney({ amount: p.amountOff ?? 0, currency: p.currency ?? "UGX" })) },
                { key: "u", header: "Used", numeric: true, cell: (p) => `${p.redemptions}${p.maxRedemptions ? ` / ${p.maxRedemptions}` : ""}` },
                { key: "a", header: "Active", cell: (p) => (p.active ? "Yes" : "No") },
              ]}
            />
          </Panel>
        </div>
      ) : null}
    </>
  );
}
