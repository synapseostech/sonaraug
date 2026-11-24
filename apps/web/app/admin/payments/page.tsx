import { staffCan } from "@kito/auth";
import { formatMoney } from "@kito/billing";
import { DataTable, Empty, KeyValues, Notice, PageHeader, Panel, Pill, formatDate } from "../../../components/sonara/ui.tsx";
import { requireStaff } from "../../../lib/server/auth.ts";
import { adminBilling } from "../../../lib/server/billing.ts";
import { paymentMode, publicPaymentStatus } from "../../../lib/server/payments-config.ts";
import { JobButtons, RefundDecisionForm } from "../forms.tsx";

export const metadata = { title: "Payments · Admin" };

const TONE = { successful: "ok", failed: "danger", mismatch: "danger", pending: "warn", initiated: "neutral", reversed: "info" } as const;

export default async function AdminPaymentsPage({ searchParams }: { searchParams: Promise<{ status?: string; env?: string }> }) {
  const viewer = await requireStaff("payments:read", "/admin/payments");
  const { status, env } = await searchParams;
  const data = await adminBilling(viewer);
  const canReconcile = staffCan(viewer.roles, "payments:reconcile");
  const email = (id: string) => data.users.find((u) => u.id === id)?.email ?? id;
  const tx = [...data.transactions].reverse().filter((t) => (!status || t.status === status) && (!env || t.environment === env));
  const mode = paymentMode(data.settings);
  return (
    <>
      <PageHeader title="Payments" description="Every transaction is verified with Flutterwave before it grants access. Transactions cannot be marked paid by hand; use an audited entitlement adjustment to correct access." />
      <Notice tone={mode === "flutterwave_live" ? "info" : "warn"} title={publicPaymentStatus(data.settings).label}>
        Webhook endpoint: <span className="sn-mono">/api/payments/flutterwave/webhook</span> (verif-hash checked) · Redirect: <span className="sn-mono">/api/payments/flutterwave/callback</span>
      </Notice>
      <Panel title="Reconciliation" subtitle={`${data.issues.length} issue(s) found by comparing transactions, subscriptions and adjustments.`} actions={canReconcile ? <JobButtons simulator={mode === "simulator"} /> : null}>
        <DataTable
          caption="Reconciliation issues"
          rows={data.issues}
          rowKey={(i) => `${i.kind}-${i.transactionId ?? ""}-${i.subscriptionId ?? ""}`}
          empty={<Empty title="No inconsistencies found" />}
          columns={[
            { key: "s", header: "Severity", cell: (i) => <Pill tone={i.severity === "high" ? "danger" : i.severity === "medium" ? "warn" : "neutral"}>{i.severity}</Pill> },
            { key: "k", header: "Issue", cell: (i) => i.kind.replace(/_/g, " ") },
            { key: "u", header: "User", cell: (i) => email(i.userId) },
            { key: "d", header: "Detail", cell: (i) => i.detail },
          ]}
        />
      </Panel>
      <Panel title="Transactions">
        <form className="sn-toolbar" aria-label="Filter transactions">
          <select className="ws-input ws-input--select" name="status" defaultValue={status ?? ""} aria-label="Status">
            <option value="">Any status</option>
            {Object.keys(TONE).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="ws-input ws-input--select" name="env" defaultValue={env ?? ""} aria-label="Environment">
            <option value="">Any mode</option>
            <option value="live">Live</option>
            <option value="test">Test</option>
            <option value="simulator">Simulator</option>
          </select>
          <button className="kt-btn kt-btn--secondary kt-btn--sm" type="submit">Filter</button>
        </form>
        <DataTable
          caption="Transactions"
          rows={tx}
          rowKey={(t) => t.id}
          empty={<Empty title="No transactions" />}
          columns={[
            { key: "d", header: "Created", cell: (t) => formatDate(t.createdAt, true) },
            { key: "u", header: "User", cell: (t) => email(t.userId) },
            { key: "a", header: "Amount", numeric: true, cell: (t) => formatMoney({ amount: t.amount, currency: t.currency }) },
            { key: "s", header: "Status", cell: (t) => <Pill tone={TONE[t.status]}>{t.status}</Pill> },
            { key: "m", header: "Method", cell: (t) => t.paymentType ?? "—" },
            { key: "r", header: "Sonara ref", cell: (t) => <span className="sn-mono">{t.txRef}</span> },
            { key: "f", header: "Flutterwave id", cell: (t) => <span className="sn-mono">{t.providerTransactionId ?? "—"}</span> },
            { key: "e", header: "Mode", cell: (t) => t.environment },
            { key: "x", header: "Notes", cell: (t) => [t.failureReason, t.overpaid ? "overpaid" : null, t.refundStatus !== "none" ? `refund ${t.refundStatus}` : null].filter(Boolean).join(" · ") || "—" },
          ]}
        />
      </Panel>
      <Panel title="Refund requests">
        {data.refunds.length === 0 ? (
          <Empty title="No refund requests" />
        ) : (
          <div className="sn-stack">
            {[...data.refunds].reverse().map((r) => {
              const t = data.transactions.find((x) => x.id === r.transactionId);
              return (
                <Panel key={r.id} title={`${email(r.requestedBy)} · ${t ? formatMoney({ amount: t.amount, currency: t.currency }) : ""}`} actions={<Pill tone={r.status === "requested" ? "warn" : "neutral"}>{r.status}</Pill>}>
                  <KeyValues items={[["Transaction", <span key="t" className="sn-mono">{t?.txRef}</span>], ["Reason", r.reason], ["Requested", formatDate(r.createdAt, true)], ["Decision", r.decisionNote ?? "—"]]} />
                  {canReconcile && r.status !== "refunded" && r.status !== "rejected" ? <RefundDecisionForm id={r.id} /> : null}
                </Panel>
              );
            })}
          </div>
        )}
        <p className="sn-small">Refunds are issued from the Flutterwave dashboard; the refund API has not been integrated or verified in this build.</p>
      </Panel>
      <Panel title="Webhook deliveries" subtitle="Every delivery is recorded, including rejected ones. Customer details are not stored.">
        <DataTable
          caption="Webhook deliveries"
          rows={[...data.webhookEvents].reverse().slice(0, 100)}
          rowKey={(w) => w.id}
          empty={<Empty title="No webhooks received" />}
          columns={[
            { key: "r", header: "Received", cell: (w) => formatDate(w.receivedAt, true) },
            { key: "e", header: "Event", cell: (w) => w.eventType ?? "—" },
            { key: "s", header: "Signature", cell: (w) => (w.signatureValid ? <Pill tone="ok">valid</Pill> : <Pill tone="danger">rejected</Pill>) },
            { key: "p", header: "Processing", cell: (w) => <Pill tone={w.processingStatus === "processed" ? "ok" : w.processingStatus === "failed" || w.processingStatus === "rejected" ? "danger" : "neutral"}>{w.processingStatus}</Pill> },
            { key: "n", header: "Deliveries", numeric: true, cell: (w) => w.attempts },
            { key: "k", header: "Key", cell: (w) => <span className="sn-mono">{w.idempotencyKey ?? "—"}</span> },
            { key: "x", header: "Error", cell: (w) => w.error ?? "—" },
          ]}
        />
      </Panel>
    </>
  );
}
