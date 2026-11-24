"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatRssDuration } from "@kito/studio";
import type { VideoItem } from "@kito/studio";
import {
  DataTable,
  EmptyHint,
  Field,
  Notice,
  PageHead,
  Panel,
  PublicationPill,
  ReviewPill,
  Select,
  Stat,
  TextArea,
  TextInput,
} from "../../../components/studio-ui.tsx";
import type { Column } from "../../../components/studio-ui.tsx";
import { useStudio } from "../../../lib/studio/store.tsx";

const CATEGORIES = ["Documentary", "Music", "Comedy", "News", "Culture", "Education", "Lifestyle"] as const;

export default function VideoStudioPage() {
  const studio = useStudio();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [error, setError] = useState<string | null>(null);

  const videos = studio.state.videos;
  const withFile = videos.filter((video) => video.fileName).length;
  const published = videos.filter((video) => video.publicationStatus === "published").length;
  const inReview = videos.filter((video) => video.reviewStatus === "pending").length;

  const create = () => {
    if (title.trim().length < 3) {
      setError("Give the video a title of at least 3 characters.");
      return;
    }
    const video = studio.createVideo({ title: title.trim(), description: description.trim(), category });
    router.push(`/studio/video/${video.id}`);
  };

  const columns: readonly Column<VideoItem>[] = [
    {
      key: "title",
      header: "Video",
      render: (video) => (
        <div>
          <p className="ws-row__title" style={{ margin: 0 }}>
            {video.title}
          </p>
          <p className="ws-row__sub" style={{ margin: "2px 0 0" }}>
            {video.category} · {video.fileName ?? "no file selected"}
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
    {
      key: "visibility",
      header: "Visibility",
      width: "110px",
      render: (video) => <span className="ws-mono">{video.visibility}</span>,
    },
    { key: "publication", header: "Stage", width: "140px", render: (video) => <PublicationPill status={video.publicationStatus} /> },
    { key: "review", header: "Review", width: "140px", render: (video) => <ReviewPill status={video.reviewStatus} /> },
    {
      key: "open",
      header: "",
      width: "90px",
      render: (video) => (
        <a className="kt-btn kt-btn--secondary kt-btn--sm" href={`/studio/video/${video.id}`}>
          Open
        </a>
      ),
    },
  ];

  return (
    <>
      <PageHead
        title="Video studio"
        description="Prepare vlog drafts from a local video file, add metadata and thumbnails, then take them through review before publishing."
      />

      <Notice tone="warn">
        <strong>Local files only.</strong> This build selects a video from your device for preview in this tab. Nothing is uploaded to a
        cloud service, transcoded or hosted — a published video is a local record, not a playable public URL.
      </Notice>

      <div className="ws-stats">
        <Stat label="Videos" value={videos.length} hint="Across every stage" />
        <Stat label="With a local file" value={withFile} hint="Previewable this session" />
        <Stat label="In review" value={inReview} hint="Waiting on a reviewer" />
        <Stat label="Published" value={published} hint="Local record only" tone={published > 0 ? "ok" : undefined} />
      </div>

      <Panel title="Videos" subtitle="Drafts, review and published records">
        <DataTable
          columns={columns}
          rows={videos}
          empty={
            <EmptyHint title="No videos yet" action={<a className="kt-btn kt-btn--primary kt-btn--sm" href="#new-video">Start a draft</a>}>
              Create a draft below, then pick a video file from your device.
            </EmptyHint>
          }
        />
      </Panel>

      <Panel id="new-video" title="New video draft" subtitle="Start with a title — you can add the file and metadata next">
        <div className="ws-form">
          <Field label="Title" hint="3 characters minimum">
            <TextInput value={title} onChange={setTitle} placeholder="e.g. Kampala at 6am — a boda ride" />
          </Field>
          <Field label="Category">
            <Select
              value={category}
              onChange={setCategory}
              options={CATEGORIES.map((value) => ({ value, label: value }))}
            />
          </Field>
          <Field label="Description" hint="Shown under the video once published">
            <TextArea
              rows={4}
              value={description}
              onChange={setDescription}
              placeholder="What happens in this video, where it was filmed and who appears in it."
            />
          </Field>
        </div>
        {error ? <p className="ws-formerror" role="alert">{error}</p> : null}
        <div className="ws-actions">
          <button type="button" className="kt-btn kt-btn--primary" onClick={create}>
            Create draft
          </button>
        </div>
      </Panel>
    </>
  );
}
