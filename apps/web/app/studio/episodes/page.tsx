"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatRssDuration } from "@kito/studio";
import { DataTable, LinkButton, PageHead, Panel, PublicationPill, ReviewPill, StatusPill, EmptyHint } from "../../../components/studio-ui.tsx";
import type { Column } from "../../../components/studio-ui.tsx";
import { useStudio } from "../../../lib/studio/store.tsx";
import type { Episode } from "@kito/studio";

export default function EpisodesPage() {
  const studio = useStudio();
  const [filter, setFilter] = useState<"all" | "drafting" | "review" | "published">("all");

  const rows = useMemo(() => {
    return studio.state.episodes
      .filter((episode) => {
        if (filter === "all") return true;
        if (filter === "drafting") return ["draft", "recording", "editing"].includes(episode.publicationStatus);
        if (filter === "review") return episode.publicationStatus === "review";
        return episode.publicationStatus === "published";
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [studio.state.episodes, filter]);

  const columns: readonly Column<Episode>[] = [
    {
      key: "title",
      header: "Episode",
      render: (episode) => {
        const show = studio.showFor(episode.showId);
        return (
          <div>
            <Link href={`/studio/episodes/${episode.id}`}>{episode.title}</Link>
            <p className="ws-row__sub" style={{ margin: "2px 0 0" }}>
              {show?.title ?? "Unknown show"} · S{episode.seasonNumber}E{episode.number}
            </p>
          </div>
        );
      },
    },
    {
      key: "length",
      header: "Length",
      width: "100px",
      render: (episode) => <span className="ws-table__num">{episode.durationSeconds ? formatRssDuration(episode.durationSeconds) : "—"}</span>,
    },
    { key: "audio", header: "Audio", width: "120px", render: (episode) => <StatusPill kind="plain" value={episode.audioSource} /> },
    { key: "publication", header: "Publication", width: "150px", render: (episode) => <PublicationPill status={episode.publicationStatus} /> },
    { key: "review", header: "Review", width: "150px", render: (episode) => <ReviewPill status={episode.reviewStatus} /> },
    {
      key: "actions",
      header: "",
      width: "100px",
      render: (episode) => <LinkButton href={`/studio/episodes/${episode.id}`}>Edit</LinkButton>,
    },
  ];

  return (
    <>
      <PageHead
        title="Episodes"
        description="Every episode across your shows, with its position in the publication pipeline."
        actions={
          <>
            <LinkButton href="/studio/record" variant="primary">
              Recording studio
            </LinkButton>
            <LinkButton href="/studio/publishing">Publishing queue</LinkButton>
          </>
        }
      />

      <Panel
        title={`${rows.length} episodes`}
        subtitle="Filter by stage, then open an episode to work on it"
        actions={
          <div className="ws-chips">
            {(
              [
                ["all", "All"],
                ["drafting", "Drafting"],
                ["review", "In review"],
                ["published", "Published"],
              ] as const
            ).map(([value, label]) => (
              <button key={value} type="button" className={`ws-chip${filter === value ? " ws-chip--on" : ""}`} onClick={() => setFilter(value)}>
                {label}
              </button>
            ))}
          </div>
        }
      >
        <DataTable
          columns={columns}
          rows={rows}
          empty={
            <EmptyHint title="No episodes in this stage" action={<LinkButton href="/studio/podcasts">Go to shows</LinkButton>}>
              Change the filter, or create an episode from a show.
            </EmptyHint>
          }
        />
      </Panel>
    </>
  );
}
