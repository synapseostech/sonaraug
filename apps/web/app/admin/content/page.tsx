"use client";

import { useMemo, useState } from "react";
import { formatRssDuration } from "@kito/studio";
import type { Episode, Show, VideoItem } from "@kito/studio";
import {
  DataTable,
  DemoBadge,
  EmptyHint,
  Field,
  Notice,
  PageHead,
  Panel,
  PublicationPill,
  ReviewPill,
  Stat,
  StatusPill,
  TextArea,
} from "../../../components/studio-ui.tsx";
import type { Column } from "../../../components/studio-ui.tsx";
import { useStudio } from "../../../lib/studio/store.tsx";

type Kind = "show" | "episode" | "video";
type Selection = { kind: Kind; id: string } | null;

export default function AdminContentPage() {
  const studio = useStudio();
  const [kind, setKind] = useState<Kind>("episode");
  const [filter, setFilter] = useState<"all" | "pending" | "changes_requested">("pending");
  const [selected, setSelected] = useState<Selection>(null);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);

  const shows = useMemo(() => studio.state.shows.filter((show) => filter === "all" || show.reviewStatus === filter), [studio.state.shows, filter]);
  const episodes = useMemo(
    () => studio.state.episodes.filter((episode) => filter === "all" || episode.reviewStatus === filter),
    [studio.state.episodes, filter],
  );
  const videos = useMemo(
    () => studio.state.videos.filter((video) => filter === "all" || video.reviewStatus === filter),
    [studio.state.videos, filter],
  );

  const pendingShows = studio.state.shows.filter((show) => show.reviewStatus === "pending").length;
  const pendingEpisodes = studio.state.episodes.filter((episode) => episode.reviewStatus === "pending").length;
  const pendingVideos = studio.state.videos.filter((video) => video.reviewStatus === "pending").length;
  const approved = [...studio.state.shows, ...studio.state.episodes, ...studio.state.videos].filter((item) => item.reviewStatus === "approved").length;

  const currentShow = selected?.kind === "show" ? studio.state.shows.find((entry) => entry.id === selected.id) : undefined;
  const currentEpisode = selected?.kind === "episode" ? studio.state.episodes.find((entry) => entry.id === selected.id) : undefined;
  const currentVideo = selected?.kind === "video" ? studio.state.videos.find((entry) => entry.id === selected.id) : undefined;
  const current = currentShow ?? currentEpisode ?? currentVideo;

  const showFor = (episode: Episode) => studio.state.shows.find((show) => show.id === episode.showId);

  const showColumns: readonly Column<Show>[] = [
    {
      key: "title",
      header: "Show",
      render: (show) => (
        <div>
          <p className="ws-row__title" style={{ margin: 0 }}>
            {show.title}
          </p>
          <p className="ws-row__sub" style={{ margin: "2px 0 0" }}>
            {show.hosts.map((host) => host.name).join(", ") || "no hosts"} · {show.categories.join(", ")}
          </p>
        </div>
      ),
    },
    { key: "rights", header: "Rights", width: "150px", render: (show) => <StatusPill kind="plain" value={show.rights.replace(/_/g, " ")} /> },
    { key: "languages", header: "Languages", width: "160px", render: (show) => <span className="ws-row__sub">{show.languages.join(", ")}</span> },
    { key: "review", header: "Review", width: "150px", render: (show) => <ReviewPill status={show.reviewStatus} /> },
    {
      key: "pick",
      header: "",
      width: "90px",
      render: (show) => (
        <button
          type="button"
          className="kt-btn kt-btn--secondary kt-btn--sm"
          onClick={() => {
            setSelected({ kind: "show", id: show.id });
            setNote("");
          }}
        >
          Review
        </button>
      ),
    },
  ];

  const episodeColumns: readonly Column<Episode>[] = [
    {
      key: "title",
      header: "Episode",
      render: (episode) => (
        <div>
          <p className="ws-row__title" style={{ margin: 0 }}>
            {episode.title}
          </p>
          <p className="ws-row__sub" style={{ margin: "2px 0 0" }}>
            {showFor(episode)?.title ?? "unknown show"} · S{episode.seasonNumber}E{episode.number}
          </p>
        </div>
      ),
    },
    { key: "audio", header: "Audio", width: "110px", render: (episode) => <StatusPill kind="plain" value={episode.audioSource} /> },
    {
      key: "length",
      header: "Length",
      width: "90px",
      render: (episode) => <span className="ws-table__num">{episode.durationSeconds ? formatRssDuration(episode.durationSeconds) : "—"}</span>,
    },
    { key: "rights", header: "Rights", width: "150px", render: (episode) => <StatusPill kind="plain" value={episode.rights.replace(/_/g, " ")} /> },
    { key: "stage", header: "Stage", width: "130px", render: (episode) => <PublicationPill status={episode.publicationStatus} /> },
    { key: "review", header: "Review", width: "140px", render: (episode) => <ReviewPill status={episode.reviewStatus} /> },
    {
      key: "pick",
      header: "",
      width: "90px",
      render: (episode) => (
        <button
          type="button"
          className="kt-btn kt-btn--secondary kt-btn--sm"
          onClick={() => {
            setSelected({ kind: "episode", id: episode.id });
            setNote("");
          }}
        >
          Review
        </button>
      ),
    },
  ];

  const videoColumns: readonly Column<VideoItem>[] = [
    {
      key: "title",
      header: "Video",
      render: (video) => (
        <div>
          <p className="ws-row__title" style={{ margin: 0 }}>
            {video.title}
          </p>
          <p className="ws-row__sub" style={{ margin: "2px 0 0" }}>
            {video.category} · {video.fileName ?? "no file"}
          </p>
        </div>
      ),
    },
    {
      key: "length",
      header: "Length",
      width: "90px",
      render: (video) => <span className="ws-table__num">{video.durationSeconds ? formatRssDuration(video.durationSeconds) : "—"}</span>,
    },
    { key: "rights", header: "Rights", width: "150px", render: (video) => <StatusPill kind="plain" value={video.rights.replace(/_/g, " ")} /> },
    { key: "visibility", header: "Visibility", width: "110px", render: (video) => <span className="ws-mono">{video.visibility}</span> },
    { key: "stage", header: "Stage", width: "130px", render: (video) => <PublicationPill status={video.publicationStatus} /> },
    { key: "review", header: "Review", width: "140px", render: (video) => <ReviewPill status={video.reviewStatus} /> },
    {
      key: "pick",
      header: "",
      width: "90px",
      render: (video) => (
        <button
          type="button"
          className="kt-btn kt-btn--secondary kt-btn--sm"
          onClick={() => {
            setSelected({ kind: "video", id: video.id });
            setNote("");
          }}
        >
          Review
        </button>
      ),
    },
  ];

  const decide = (verdict: "approve" | "reject" | "changes_requested") => {
    if (!current || !selected) return;
    const result =
      selected.kind === "show"
        ? studio.reviewShow(current.id, verdict, note)
        : selected.kind === "episode"
          ? studio.reviewEpisode(current.id, verdict, note)
          : studio.reviewVideo(current.id, verdict, note);
    if (!result.ok) {
      setMessage({ tone: "warn", text: result.reason });
      return;
    }
    setMessage({ tone: "ok", text: `Recorded “${verdict.replace(/_/g, " ")}” for “${current.title}”.` });
    setNote("");
    setSelected(null);
  };

  return (
    <>
      <PageHead
        title="Podcast and video review"
        description="Approve, reject or return content with a written reason. Shows are reviewed separately because their episodes inherit the decision."
        actions={<DemoBadge />}
      />

      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}

      <div className="ws-stats">
        <Stat label="Shows pending" value={pendingShows} hint="Blocks all their episodes" tone={pendingShows ? "warn" : undefined} />
        <Stat label="Episodes pending" value={pendingEpisodes} hint="Awaiting a verdict" tone={pendingEpisodes ? "warn" : undefined} />
        <Stat label="Videos pending" value={pendingVideos} hint="Awaiting a verdict" tone={pendingVideos ? "warn" : undefined} />
        <Stat label="Approved items" value={approved} hint="Cleared to publish" tone={approved ? "ok" : undefined} />
      </div>

      <Panel
        title="Review queue"
        subtitle="Filter by review state, then open an item to record a decision"
        actions={
          <div className="ws-chips">
            {(["pending", "changes_requested", "all"] as const).map((value) => (
              <button key={value} type="button" className={`ws-chip${filter === value ? " ws-chip--on" : ""}`} onClick={() => setFilter(value)}>
                {value.replace(/_/g, " ")}
              </button>
            ))}
          </div>
        }
      >
        <div className="ws-chips" role="tablist" aria-label="Content type">
          <button type="button" role="tab" aria-selected={kind === "show"} className={`ws-chip${kind === "show" ? " ws-chip--on" : ""}`} onClick={() => setKind("show")}>
            Podcast shows ({shows.length})
          </button>
          <button type="button" role="tab" aria-selected={kind === "episode"} className={`ws-chip${kind === "episode" ? " ws-chip--on" : ""}`} onClick={() => setKind("episode")}>
            Episodes ({episodes.length})
          </button>
          <button type="button" role="tab" aria-selected={kind === "video"} className={`ws-chip${kind === "video" ? " ws-chip--on" : ""}`} onClick={() => setKind("video")}>
            Videos ({videos.length})
          </button>
        </div>

        {kind === "show" ? (
          <DataTable columns={showColumns} rows={shows} empty={<EmptyHint title="Nothing in this state">Change the filter to see other shows.</EmptyHint>} />
        ) : kind === "episode" ? (
          <DataTable
            columns={episodeColumns}
            rows={episodes}
            empty={<EmptyHint title="Nothing in this state">Change the filter to see other episodes.</EmptyHint>}
          />
        ) : (
          <DataTable columns={videoColumns} rows={videos} empty={<EmptyHint title="Nothing in this state">Change the filter to see other videos.</EmptyHint>} />
        )}
      </Panel>

      <Panel
        title={current ? `Reviewing: ${current.title}` : "Review decision"}
        subtitle={current ? "Check rights and assets before deciding" : "Select an item from the queue above"}
      >
        {!current ? (
          <EmptyHint title="No item selected">Pick “Review” on a row to see its evidence here.</EmptyHint>
        ) : (
          <>
            <dl className="ws-kv">
              <dt>Type</dt>
              <dd>{selected?.kind === "show" ? "Podcast show" : selected?.kind === "episode" ? "Podcast episode" : "Video"}</dd>
              <dt>Rights declared</dt>
              <dd>{current.rights.replace(/_/g, " ")}</dd>
              <dt>Asset</dt>
              <dd>
                {currentShow
                  ? "show-level decision — episodes inherit it"
                  : currentEpisode
                    ? currentEpisode.audioSource === "none"
                      ? "no audio attached — cannot be published"
                      : `audio ${currentEpisode.audioSource}${currentEpisode.durationSeconds ? ` · ${formatRssDuration(currentEpisode.durationSeconds)}` : ""}`
                    : currentVideo?.fileName
                      ? `local file ${currentVideo.fileName} · not hosted`
                      : "no file selected"}
              </dd>
              <dt>Description</dt>
              <dd>{current.description || "empty"}</dd>
              <dt>Stage</dt>
              <dd>
                {currentShow
                  ? `show review ${currentShow.reviewStatus}`
                  : `${currentEpisode?.publicationStatus ?? currentVideo?.publicationStatus ?? "—"} · review ${current.reviewStatus}`}
              </dd>
              <dt>Show review</dt>
              <dd>{currentEpisode ? `${showFor(currentEpisode)?.title ?? "unknown"} · ${showFor(currentEpisode)?.reviewStatus ?? "n/a"}` : "n/a"}</dd>
            </dl>

            {current.rights === "undisclosed" ? (
              <Notice tone="warn">
                Rights are undeclared. Approving this would let a creator publish material with no stated basis — reject or request changes instead.
              </Notice>
            ) : null}

            <Field label="Reason / note" htmlFor="review-note" hint="At least 8 characters. Stored in the item history and shown to the creator.">
              <TextArea id="review-note" rows={3} value={note} onChange={setNote} placeholder="What you checked and why you decided this." />
            </Field>

            <div className="ws-actions">
              <button type="button" className="kt-btn kt-btn--primary" onClick={() => decide("approve")}>
                Approve
              </button>
              <button type="button" className="kt-btn kt-btn--secondary" onClick={() => decide("changes_requested")}>
                Request changes
              </button>
              <button type="button" className="kt-btn kt-btn--ghost" onClick={() => decide("reject")}>
                Reject
              </button>
            </div>
          </>
        )}
      </Panel>
    </>
  );
}
