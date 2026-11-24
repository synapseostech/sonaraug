import { notFound } from "next/navigation";
import { ALL_PLATFORM_ROLES, ROLE_LABEL, staffCan } from "@kito/auth";
import { formatMoney } from "@kito/billing";
import { DataTable, Empty, KeyValues, PageHeader, Panel, Pill, formatDate } from "../../../../components/sonara/ui.tsx";
import { requireStaff } from "../../../../lib/server/auth.ts";
import { userDetail } from "../../../../lib/server/users.ts";
import { AccountStatusForm, RoleForm } from "../../forms.tsx";

export default async function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await requireStaff("users:read", `/admin/users/${id}`);
  const detail = await userDetail(viewer, id);
  if (!detail) notFound();
  const { user, entitlement, subscriptions, transactions, overrides, audit, sessions, plans } = detail;
  const self = viewer.id === user.id;
  return (
    <>
      <PageHeader eyebrow="User" title={user.displayName} description={user.email} actions={<Pill tone={user.status === "active" ? "ok" : "danger"}>{user.status}</Pill>} />
      <div className="sn-admin-grid">
        <div className="sn-stack--lg">
          <Panel title="Account">
            <KeyValues
              items={[
                ["User id", <span key="i" className="sn-mono">{user.id}</span>],
                ["Created", formatDate(user.createdAt, true)],
                ["Email verified", user.emailVerifiedAt ? formatDate(user.emailVerifiedAt, true) : "No"],
                ["Country", user.country],
                ["Signed-in sessions", sessions],
                ["Terms accepted", `${user.termsVersion} on ${formatDate(user.termsAcceptedAt)}`],
                ["Deletion requested", user.deletionRequestedAt ? formatDate(user.deletionRequestedAt, true) : "No"],
                ["Suspension reason", user.suspendedReason ?? "—"],
                ["Staff roles", user.roles.map((r) => ROLE_LABEL[r]).join(", ") || "None"],
                ["Premium listening", entitlement.premium ? `Yes (${entitlement.source})` : "No"],
              ]}
            />
          </Panel>
          <Panel title="Subscriptions">
            <DataTable caption="Subscriptions" rows={subscriptions} rowKey={(s) => s.id} empty={<Empty title="None" />} columns={[
              { key: "p", header: "Plan", cell: (s) => plans.find((p) => p.id === s.planId)?.name ?? s.planId },
              { key: "s", header: "Status", cell: (s) => `${s.status}${s.cancelAtPeriodEnd ? " (cancelling)" : ""}` },
              { key: "e", header: "Period end", cell: (s) => formatDate(s.currentPeriodEnd) },
            ]} />
          </Panel>
          <Panel title="Payments">
            {transactions === null ? (
              <p className="sn-small">Your role cannot view payment history.</p>
            ) : (
              <DataTable caption="Payments" rows={transactions} rowKey={(t) => t.id} empty={<Empty title="None" />} columns={[
                { key: "d", header: "Date", cell: (t) => formatDate(t.createdAt, true) },
                { key: "a", header: "Amount", numeric: true, cell: (t) => formatMoney({ amount: t.amount, currency: t.currency }) },
                { key: "s", header: "Status", cell: (t) => t.status },
                { key: "e", header: "Mode", cell: (t) => t.environment },
              ]} />
            )}
          </Panel>
          <Panel title="Entitlement adjustments">
            <DataTable caption="Adjustments" rows={overrides} rowKey={(o) => o.id} empty={<Empty title="None" />} columns={[
              { key: "e", header: "Effect", cell: (o) => `${o.audience} ${o.effect}` },
              { key: "r", header: "Reason", cell: (o) => o.reason },
              { key: "u", header: "Until", cell: (o) => (o.revokedAt ? "revoked" : formatDate(o.validUntil)) },
            ]} />
          </Panel>
          <Panel title="Audit history">
            <ul className="sn-timeline">
              {audit.map((a) => (
                <li key={a.id}>
                  <time>{formatDate(a.occurredAt, true)}</time>
                  <span className="sn-mono">{a.action}</span>{a.reason ? ` — ${a.reason}` : ""}
                </li>
              ))}
              {audit.length === 0 ? <li>None.</li> : null}
            </ul>
          </Panel>
        </div>
        <div className="sn-stack">
          {staffCan(viewer.roles, "roles:grant") ? (
            <Panel title="Staff roles" subtitle={self ? "You cannot change your own roles." : "Only a super administrator can grant administrator roles."}>
              {self ? null : <RoleForm userId={user.id} roles={ALL_PLATFORM_ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }))} />}
            </Panel>
          ) : null}
          {staffCan(viewer.roles, "users:manage") && !self ? (
            <Panel title={user.status === "suspended" ? "Reactivate" : "Suspend"} tone={user.status === "suspended" ? undefined : "danger"}>
              <AccountStatusForm userId={user.id} suspended={user.status === "suspended"} />
            </Panel>
          ) : null}
        </div>
      </div>
    </>
  );
}
