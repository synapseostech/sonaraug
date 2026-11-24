import Link from "next/link";
import { staffCan } from "@kito/auth";
import { Empty, PageHeader, Panel } from "../../../../../components/sonara/ui.tsx";
import { requireStaff } from "../../../../../lib/server/auth.ts";
import { adminChronicles } from "../../../../../lib/server/chronicles.ts";
import { EpisodeForm } from "../../forms.tsx";

export const metadata = { title: "New episode" };

export default async function NewEpisodePage({ searchParams }: { searchParams: Promise<{ series?: string }> }) {
  const viewer = await requireStaff("chronicles:edit", "/admin/medical-chronicles/episodes/new");
  const { series: seriesId } = await searchParams;
  const { series, episodes } = await adminChronicles(viewer);
  const target = series.find((s) => s.id === seriesId);
  if (!target) {
    return (
      <>
        <PageHeader title="New episode" description="Choose the series first." />
        {series.length ? (
          <ul className="sn-timeline">
            {series.map((s) => (
              <li key={s.id}>
                <Link className="sn-link" href={`/admin/medical-chronicles/episodes/new?series=${s.id}`}>{s.title}</Link>
              </li>
            ))}
          </ul>
        ) : (
          <Empty title="Create a series first" action={<Link className="kt-btn kt-btn--primary" href="/admin/medical-chronicles/series/new">New series</Link>} />
        )}
      </>
    );
  }
  const nextNumber = Math.max(0, ...episodes.filter((e) => e.seriesId === target.id).map((e) => e.episodeNumber ?? 0)) + 1;
  return (
    <>
      <PageHeader eyebrow={target.title} title="New episode" description="Create the draft, then attach audio and submit it for review." />
      <Panel>
        <EpisodeForm
          seriesId={target.id}
          values={{ title: "", slug: "", description: "", season: 1, episodeNumber: nextNumber, durationSeconds: null, transcript: "", contentNotes: "", references: [], aiDisclosure: "ai_generated", accessOverride: "inherit", downloadAllowed: false, relatedEpisodeIds: [] }}
          published={false}
          canReview={staffCan(viewer.roles, "chronicles:review")}
          siblings={[]}
        />
      </Panel>
    </>
  );
}
