import { staffCan } from "@kito/auth";
import { DataTable, Notice, PageHeader, Panel, Pill } from "../../../../components/sonara/ui.tsx";
import { requireStaff } from "../../../../lib/server/auth.ts";
import { adminChronicles } from "../../../../lib/server/chronicles.ts";
import { CategoryCreateForm, CategoryRowForms } from "../forms.tsx";

export const metadata = { title: "Categories · Medical Chronicles" };

export default async function CategoriesAdminPage() {
  const viewer = await requireStaff("chronicles:edit", "/admin/medical-chronicles/categories");
  const { categories, series } = await adminChronicles(viewer);
  const canManage = staffCan(viewer.roles, "chronicles:categories");
  return (
    <>
      <PageHeader title="Categories" description="Topics and specialties shown to listeners. The order here is the order on the public pages. Deactivated categories are hidden but kept." />
      {!canManage ? <Notice tone="info">Only administrators can change categories.</Notice> : null}
      <Panel>
        <DataTable
          caption="Categories"
          rows={categories}
          rowKey={(c) => c.id}
          columns={[
            { key: "n", header: "Name", cell: (c) => c.name },
            { key: "k", header: "Type", cell: (c) => c.kind },
            { key: "s", header: "Address", cell: (c) => <span className="sn-mono">{c.slug}</span> },
            { key: "a", header: "State", cell: (c) => <Pill tone={c.isActive ? "ok" : "neutral"}>{c.isActive ? "Active" : "Inactive"}</Pill> },
            { key: "u", header: "Series", numeric: true, cell: (c) => series.filter((s) => s.categoryId === c.id || s.specialtyId === c.id).length },
            {
              key: "x",
              header: "",
              cell: (c) => (canManage ? <CategoryRowForms id={c.id} name={c.name} description={c.description} kind={c.kind} active={c.isActive} first={categories[0]?.id === c.id} last={categories[categories.length - 1]?.id === c.id} /> : null),
            },
          ]}
        />
      </Panel>
      {canManage ? (
        <Panel title="Add a category">
          <CategoryCreateForm />
        </Panel>
      ) : null}
    </>
  );
}
