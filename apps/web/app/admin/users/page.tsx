import Link from "next/link";
import { ALL_PLATFORM_ROLES, ROLE_LABEL } from "@kito/auth";
import { DataTable, Empty, PageHeader, Pagination, Pill, formatDate } from "../../../components/sonara/ui.tsx";
import { requireStaff } from "../../../lib/server/auth.ts";
import { searchUsers } from "../../../lib/server/users.ts";

export const metadata = { title: "Users · Admin" };

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string; role?: string; status?: string; page?: string }> }) {
  const viewer = await requireStaff("users:read", "/admin/users");
  const params = await searchParams;
  const result = await searchUsers(viewer, { q: params.q, role: params.role, status: params.status, page: Number(params.page ?? 1) || 1 });
  const qs = (page: number) => `/admin/users?${new URLSearchParams({ ...(params.q ? { q: params.q } : {}), ...(params.role ? { role: params.role } : {}), ...(params.status ? { status: params.status } : {}), page: String(page) })}`;
  return (
    <>
      <PageHeader title="Users" description={`${result.total} account(s)`} />
      <form className="sn-toolbar" role="search" aria-label="Find users">
        <input className="ws-input" type="search" name="q" defaultValue={params.q} placeholder="Email, name or id" aria-label="Search users" />
        <select className="ws-input ws-input--select" name="role" defaultValue={params.role ?? ""} aria-label="Role">
          <option value="">Any role</option>
          <option value="staff">Any staff role</option>
          {ALL_PLATFORM_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
        </select>
        <select className="ws-input ws-input--select" name="status" defaultValue={params.status ?? ""} aria-label="Status">
          <option value="">Any status</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
        </select>
        <button className="kt-btn kt-btn--secondary kt-btn--sm" type="submit">Search</button>
      </form>
      <DataTable
        caption="Users"
        rows={result.rows}
        rowKey={(u) => u.id}
        empty={<Empty title="No users match" />}
        columns={[
          { key: "n", header: "Name", cell: (u) => <Link className="sn-link" href={`/admin/users/${u.id}`}>{u.displayName}</Link> },
          { key: "e", header: "Email", cell: (u) => u.email },
          { key: "s", header: "Status", cell: (u) => <Pill tone={u.status === "active" ? "ok" : "danger"}>{u.status}{u.deletionRequestedAt ? " · deletion requested" : ""}</Pill> },
          { key: "v", header: "Verified", cell: (u) => (u.emailVerifiedAt ? "Yes" : "No") },
          { key: "p", header: "Listening", cell: (u) => (u.premium ? <Pill tone="accent">premium</Pill> : "free") },
          { key: "r", header: "Staff roles", cell: (u) => u.roles.join(", ") || "—" },
          { key: "c", header: "Created", cell: (u) => formatDate(u.createdAt) },
        ]}
      />
      <Pagination page={result.page} pages={result.pages} href={qs} />
    </>
  );
}
