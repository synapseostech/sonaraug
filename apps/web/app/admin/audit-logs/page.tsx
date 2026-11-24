import { DataTable, Empty, Notice, PageHeader, Pagination, formatDate } from "../../../components/sonara/ui.tsx";
import { requireStaff } from "../../../lib/server/auth.ts";
import { verifyAuditChain } from "../../../lib/server/audit.ts";
import { read } from "../../../lib/server/store.ts";

export const metadata = { title: "Audit log · Admin" };

export default async function AuditLogPage({ searchParams }: { searchParams: Promise<{ action?: string; entity?: string; actor?: string; page?: string }> }) {
  await requireStaff("audit:read", "/admin/audit-logs");
  const params = await searchParams;
  const data = await read();
  const chain = verifyAuditChain(data.audit);
  const name = (id: string | null) => (id ? data.users.find((u) => u.id === id)?.email ?? id : "system");
  const rows = [...data.audit]
    .reverse()
    .filter((a) => (!params.action || a.action.includes(params.action)) && (!params.entity || a.entityType === params.entity || a.entityId === params.entity) && (!params.actor || name(a.actorId).includes(params.actor)));
  const page = Math.max(1, Number(params.page ?? 1) || 1);
  const pages = Math.max(1, Math.ceil(rows.length / 50));
  const entities = [...new Set(data.audit.map((a) => a.entityType))].sort();
  return (
    <>
      <PageHeader title="Audit log" description="Append-only record of privileged and security-relevant actions. Values that look like secrets are redacted before they are written." />
      {chain.ok ? (
        <Notice tone="ok">Integrity check passed: {data.audit.length} records, hash chain intact.</Notice>
      ) : (
        <Notice tone="danger" title="Integrity check failed">The hash chain breaks at record {chain.brokenAtSeq}. The log has been altered outside the application.</Notice>
      )}
      <form className="sn-toolbar" role="search" aria-label="Filter audit log">
        <input className="ws-input" name="action" defaultValue={params.action} placeholder="Action contains…" aria-label="Action" />
        <select className="ws-input ws-input--select" name="entity" defaultValue={params.entity ?? ""} aria-label="Entity type">
          <option value="">Any entity</option>
          {entities.map((e) => <option key={e} value={e}>{e}</option>)}
        </select>
        <input className="ws-input" name="actor" defaultValue={params.actor} placeholder="Actor email" aria-label="Actor" />
        <button className="kt-btn kt-btn--secondary kt-btn--sm" type="submit">Filter</button>
      </form>
      <DataTable
        caption="Audit records"
        rows={rows.slice((page - 1) * 50, page * 50)}
        rowKey={(a) => a.id}
        empty={<Empty title="No records" />}
        columns={[
          { key: "w", header: "When", cell: (a) => formatDate(a.occurredAt, true) },
          { key: "a", header: "Actor", cell: (a) => <>{name(a.actorId)}<span className="sn-small"> {a.actorRoles.join(",")}</span></> },
          { key: "x", header: "Action", cell: (a) => <span className="sn-mono">{a.action}</span> },
          { key: "e", header: "Entity", cell: (a) => <span className="sn-mono">{a.entityType}{a.entityId ? ` ${a.entityId}` : ""}</span> },
          { key: "r", header: "Reason", cell: (a) => a.reason ?? "—" },
          {
            key: "d",
            header: "Change",
            cell: (a) =>
              a.before || a.after ? (
                <details>
                  <summary className="sn-link">View</summary>
                  <pre className="sn-code">{JSON.stringify({ before: a.before, after: a.after }, null, 2).slice(0, 4000)}</pre>
                </details>
              ) : (
                "—"
              ),
          },
          { key: "q", header: "Request", cell: (a) => <span className="sn-mono">{a.requestId}</span> },
        ]}
      />
      <Pagination page={page} pages={pages} href={(p) => `/admin/audit-logs?${new URLSearchParams({ ...(params.action ? { action: params.action } : {}), ...(params.entity ? { entity: params.entity } : {}), ...(params.actor ? { actor: params.actor } : {}), page: String(p) })}`} />
    </>
  );
}
