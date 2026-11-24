import Link from "next/link";
import { effectiveState, formatMoney } from "@kito/billing";
import { DataTable, Notice, PageHeader, Panel, Stat, Stats, formatDate } from "../../components/sonara/ui.tsx";
import { requireStaff } from "../../lib/server/auth.ts";
import { listenerEntitlementFor } from "../../lib/server/entitlements.ts";
import { publicPaymentStatus } from "../../lib/server/payments-config.ts";
import { read } from "../../lib/server/store.ts";

export const metadata = { title: "Admin overview" };

/** Real figures from the server store. Anything not yet on the backend is labelled, not estimated. */
export default async function AdminOverview() {
  await requireStaff("admin:access", "/admin");
  const data = await read();
  const now = new Date();
  const live = (env: string) => env === "live";
  const premium = data.users.filter((u) => listenerEntitlementFor(data, u.id, now).premium).length;
  const activeSubs = data.subscriptions.filter((s) => effectiveState(s, now, data.settings.graceDays).grantsAccess);
  const paidActive = activeSubs.filter((s) => !s.isTrial && s.appliedTransactionIds.length > 0);
  const mrrBy = (filter: (env: string) => boolean) =>
    paidActive.reduce((sum, s) => {
      const lastTx = data.transactions.find((t) => t.id === s.appliedTransactionIds[s.appliedTransactionIds.length - 1]);
      const plan = data.plans.find((p) => p.id === s.planId);
      if (!lastTx || !plan || plan.currency !== "UGX" || !filter(lastTx.environment)) return sum;
      return sum + (plan.interval === "annual" ? Math.round(plan.amount / 12) : plan.amount);
    }, 0);
  const totals = (filter: (env: string) => boolean) => data.transactions.filter((t) => t.status === "successful" && t.currency === "UGX" && filter(t.environment)).reduce((s, t) => s + t.amount, 0);
  const failed = data.transactions.filter((t) => t.status === "failed" || t.status === "mismatch").length;
  const published = data.mcEpisodes.filter((e) => e.status === "published").length;
  const inReview = data.mcEpisodes.filter((e) => e.status === "in_review").length;
  const status = publicPaymentStatus(data.settings);

  return (
    <>
      <PageHeader title="Platform overview" description="Figures come from the server-side store. Payments made through the simulator or Flutterwave test mode are counted separately and never as revenue." />
      {status.mode !== "flutterwave_live" ? <Notice tone="warn" title={status.label}>No live revenue can exist until live Flutterwave payments are approved and configured.</Notice> : null}
      <Stats>
        <Stat label="Registered users" value={data.users.length} />
        <Stat label="Premium listeners" value={premium} hint="Subscription or audited grant" />
        <Stat label="Staff accounts" value={data.users.filter((u) => u.roles.length).length} />
        <Stat label="Active subscriptions" value={activeSubs.length} hint={`${paidActive.length} paid, ${activeSubs.length - paidActive.length} trial or unpaid`} />
        <Stat label="MRR (live)" value={formatMoney({ amount: mrrBy(live), currency: "UGX" })} hint="Live payments only" />
        <Stat label="MRR (test/simulated)" value={formatMoney({ amount: mrrBy((e) => !live(e)), currency: "UGX" })} hint="Not revenue" />
        <Stat label="Collected (live)" value={formatMoney({ amount: totals(live), currency: "UGX" })} />
        <Stat label="Failed / mismatched payments" value={failed} tone={failed ? "warn" : undefined} />
        <Stat label="Published MC episodes" value={published} />
        <Stat label="Awaiting MC review" value={inReview} tone={inReview ? "warn" : undefined} />
      </Stats>
      <div className="sn-grid-2">
        <Panel title="Not yet on the backend">
          <ul className="sn-checklist">
            <li className="is-todo">Creators and broadcasters: the studio and review screens still use local demo data (see “Review (demo data)”).</li>
            <li className="is-todo">Content reports and moderation queues: demo data only.</li>
            <li className="is-todo">Listening analytics beyond Medical Chronicles plays: no event pipeline yet.</li>
          </ul>
        </Panel>
        <Panel title="Recent activity" actions={<Link className="sn-link" href="/admin/audit-logs">Audit log</Link>}>
          <DataTable
            caption="Recent audit events"
            rows={[...data.audit].reverse().slice(0, 8)}
            rowKey={(a) => a.id}
            columns={[
              { key: "when", header: "When", cell: (a) => formatDate(a.occurredAt, true) },
              { key: "action", header: "Action", cell: (a) => <span className="sn-mono">{a.action}</span> },
              { key: "actor", header: "Actor", cell: (a) => data.users.find((u) => u.id === a.actorId)?.displayName ?? (a.actorId ? a.actorId : "system") },
            ]}
          />
        </Panel>
      </div>
    </>
  );
}
