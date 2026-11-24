"use client";

import { useState } from "react";
import { formatRssDuration } from "@kito/studio";
import type { MediaAsset } from "@kito/studio";
import { DataTable, EmptyHint, LinkButton, Notice, PageHead, Panel, StatusPill } from "../../../components/studio-ui.tsx";
import type { Column } from "../../../components/studio-ui.tsx";
import { objectUrlFor, useStudio } from "../../../lib/studio/store.tsx";

export default function MediaLibraryPage() {
  const studio = useStudio();
  const [kind, setKind] = useState<"all" | "recording" | "upload">("all");
  const rows = studio.state.media.filter((asset) => kind === "all" || asset.kind === kind);

  const columns: readonly Column<MediaAsset>[] = [
    {
      key: "name",
      header: "File",
      render: (asset) => {
        const url = objectUrlFor(asset.id);
        return (
          <div>
            <p className="ws-row__title" style={{ margin: 0 }}>
              {asset.name}
            </p>
            <p className="ws-row__sub" style={{ margin: "2px 0 0" }}>
              {asset.source}
            </p>
          </div>
        );
      },
    },
    { key: "kind", header: "Source", width: "110px", render: (asset) => <StatusPill kind="plain" value={asset.kind} /> },
    {
      key: "length",
      header: "Length",
      width: "90px",
      render: (asset) => <span className="ws-table__num">{asset.durationSeconds ? formatRssDuration(asset.durationSeconds) : "—"}</span>,
    },
    {
      key: "size",
      header: "Size",
      width: "90px",
      render: (asset) => <span className="ws-table__num">{(asset.sizeBytes / 1024 / 1024).toFixed(1)} MB</span>,
    },
    { key: "created", header: "Added", width: "120px", render: (asset) => <span className="ws-mono">{asset.createdAt.slice(0, 10)}</span> },
    {
      key: "preview",
      header: "",
      width: "110px",
      render: (asset) =>
        objectUrlFor(asset.id) ? (
          <a className="kt-btn kt-btn--secondary kt-btn--sm" href={objectUrlFor(asset.id) ?? "#"} download={asset.name}>
            Download
          </a>
        ) : (
          <span className="ws-row__sub">session lost</span>
        ),
    },
  ];

  return (
    <>
      <PageHead
        title="Media library"
        description="Files recorded or selected in this browser. Metadata is stored locally; audio blobs only live for the current session."
        actions={<LinkButton href="/studio/record" variant="primary">Record audio</LinkButton>}
      />

      <Notice tone="warn">
        <strong>No cloud storage.</strong> Nothing here is uploaded. After a reload the entries remain as records (name, size, duration) but
        the audio itself is gone — use Download during the same session to keep a file.
      </Notice>

      <Panel
        title={`${rows.length} assets`}
        subtitle="Recordings and device files used by episode drafts"
        actions={
          <div className="ws-chips">
            {(["all", "recording", "upload"] as const).map((value) => (
              <button key={value} type="button" className={`ws-chip${kind === value ? " ws-chip--on" : ""}`} onClick={() => setKind(value)}>
                {value === "all" ? "All" : value === "recording" ? "Recordings" : "Uploads"}
              </button>
            ))}
          </div>
        }
      >
        <DataTable
          columns={columns}
          rows={rows}
          empty={
            <EmptyHint title="No media yet" action={<LinkButton href="/studio/record">Open the recording studio</LinkButton>}>
              Record something, or attach an audio file to an episode.
            </EmptyHint>
          }
        />
      </Panel>
    </>
  );
}
