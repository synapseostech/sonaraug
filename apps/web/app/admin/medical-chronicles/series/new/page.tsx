import { staffCan } from "@kito/auth";
import { PageHeader, Panel } from "../../../../../components/sonara/ui.tsx";
import { requireStaff } from "../../../../../lib/server/auth.ts";
import { adminChronicles } from "../../../../../lib/server/chronicles.ts";
import { SeriesForm } from "../../forms.tsx";

export const metadata = { title: "New series" };

export default async function NewSeriesPage() {
  const viewer = await requireStaff("chronicles:edit", "/admin/medical-chronicles/series/new");
  const { categories, series, settings } = await adminChronicles(viewer);
  return (
    <>
      <PageHeader title="New series" description="A series starts as a draft. A reviewer publishes it." />
      <Panel>
        <SeriesForm
          categories={categories.filter((c) => c.isActive)}
          otherSeries={series.map((s) => ({ value: s.id, label: s.title }))}
          canChangeAccess={staffCan(viewer.roles, "chronicles:review")}
          defaultAllowance={settings.defaultFreeEpisodeAllowance}
        />
      </Panel>
    </>
  );
}
