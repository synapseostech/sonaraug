"use client";

import { useMemo, useState } from "react";
import { NOTEBOOKLM_FLASHCARD_PROMPT, NOTEBOOKLM_QUIZ_PROMPT, parseFlashcards, parseQuiz } from "@kito/chronicles";
import type { ReactNode } from "react";
import { ActionForm, Checkbox, FormActions, SelectField, SubmitButton, TextArea, TextField } from "../../../components/sonara/forms.tsx";
import {
  attachSourceAction,
  createCategoryAction,
  createEpisodeAction,
  createSeriesAction,
  editorialAction_,
  medicalReviewAction,
  saveStudyAction,
  seriesStatusAction,
  sourceStatusAction,
  updateCategoryAction,
  updateEpisodeAction,
  updateSeriesAction,
} from "../actions.ts";

type Option = { value: string; label: string };

export type SeriesFormValues = {
  id?: string;
  title: string;
  slug: string;
  description: string;
  categoryId: string | null;
  specialtyId: string | null;
  editorDisplay: string;
  hostDisplay: string;
  requiresSubscription: boolean;
  freeEpisodeAllowance: number | null;
  seoTitle: string;
  seoDescription: string;
  relatedSeriesIds: string[];
};

export function SeriesForm({ values, categories, otherSeries, canChangeAccess, defaultAllowance }: { values?: SeriesFormValues; categories: { id: string; name: string; kind: string }[]; otherSeries: Option[]; canChangeAccess: boolean; defaultAllowance: number }) {
  const topics = [{ value: "", label: "— None —" }, ...categories.filter((c) => c.kind === "topic").map((c) => ({ value: c.id, label: c.name }))];
  const specialties = [{ value: "", label: "— None —" }, ...categories.filter((c) => c.kind === "specialty").map((c) => ({ value: c.id, label: c.name }))];
  return (
    <ActionForm action={values?.id ? updateSeriesAction : createSeriesAction} aria-label="Series details">
      {values?.id ? <input type="hidden" name="id" value={values.id} /> : null}
      <TextField name="title" label="Title" defaultValue={values?.title} required maxLength={200} />
      <TextField name="slug" label="Address (slug)" defaultValue={values?.slug} optionalLabel hint="Leave blank to generate from the title. Used in /medical-chronicles/series/…" />
      <TextArea name="description" label="Description" defaultValue={values?.description} rows={5} />
      <div className="ws-form-grid">
        <SelectField name="categoryId" label="Topic" options={topics} defaultValue={values?.categoryId ?? ""} />
        <SelectField name="specialtyId" label="Specialty" options={specialties} defaultValue={values?.specialtyId ?? ""} />
        <TextField name="hostDisplay" label="Host" defaultValue={values?.hostDisplay} optionalLabel hint='For NotebookLM audio, e.g. "NotebookLM Audio Overview (AI voices)".' />
        <TextField name="editorDisplay" label="Author / editor" defaultValue={values?.editorDisplay} optionalLabel />
      </div>
      <fieldset className="sn-fieldset" disabled={!canChangeAccess}>
        <legend>Access</legend>
        <Checkbox name="requiresSubscription" label="Premium episodes require a listener subscription" defaultChecked={values?.requiresSubscription ?? true} hint="When unchecked, every episode in this series is free." />
        <TextField
          name="freeEpisodeAllowance"
          label="Free episodes in this series"
          type="number"
          min={0}
          max={500}
          defaultValue={values?.freeEpisodeAllowance === null || values?.freeEpisodeAllowance === undefined ? "" : String(values.freeEpisodeAllowance)}
          optionalLabel
          hint={`Blank uses the platform default (${defaultAllowance}). Counts the first published episodes in order.`}
        />
        {!canChangeAccess ? <p className="ws-field__hint">Only a reviewer or administrator can change access rules.</p> : null}
      </fieldset>
      {!canChangeAccess && values ? (
        <>
          {values.requiresSubscription ? <input type="hidden" name="requiresSubscription" value="on" /> : null}
          <input type="hidden" name="freeEpisodeAllowance" value={values.freeEpisodeAllowance ?? ""} />
        </>
      ) : null}
      <fieldset className="sn-fieldset">
        <legend>Search and sharing</legend>
        <TextField name="seoTitle" label="SEO title" defaultValue={values?.seoTitle} optionalLabel maxLength={120} />
        <TextArea name="seoDescription" label="SEO description" defaultValue={values?.seoDescription} optionalLabel rows={2} maxLength={300} />
      </fieldset>
      {otherSeries.length ? (
        <fieldset className="sn-fieldset">
          <legend>Related series</legend>
          {otherSeries.map((s) => (
            <Checkbox key={s.value} name="relatedSeriesIds" value={s.value} label={s.label} defaultChecked={values?.relatedSeriesIds.includes(s.value)} />
          ))}
        </fieldset>
      ) : null}
      <FormActions>
        <SubmitButton>{values?.id ? "Save series" : "Create series"}</SubmitButton>
      </FormActions>
    </ActionForm>
  );
}

export function SeriesStatusForm({ id, status, canReview }: { id: string; status: string; canReview: boolean }) {
  if (!canReview) return <p className="sn-small">A reviewer or administrator publishes series.</p>;
  const options = [
    status !== "published" ? { value: "published", label: "Publish series", variant: "primary" as const } : null,
    status === "published" ? { value: "draft", label: "Unpublish", variant: "secondary" as const } : null,
    status !== "archived" ? { value: "archived", label: "Archive", variant: "ghost" as const } : null,
  ].filter((o): o is NonNullable<typeof o> => o !== null);
  return (
    <div className="sn-row">
      {options.map((o) => (
        <ActionForm key={o.value} action={seriesStatusAction} className="sn-inline-form" aria-label={o.label} confirm={o.value === "published" ? undefined : `${o.label}? Listeners will no longer see this series.`}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="status" value={o.value} />
          <SubmitButton variant={o.variant}>{o.label}</SubmitButton>
        </ActionForm>
      ))}
    </div>
  );
}

export type EpisodeFormValues = {
  id?: string;
  title: string;
  slug: string;
  description: string;
  season: number | null;
  episodeNumber: number | null;
  durationSeconds: number | null;
  transcript: string;
  contentNotes: string;
  references: { title: string; url?: string | null; citation?: string | null }[];
  aiDisclosure: string | null;
  accessOverride: string;
  downloadAllowed: boolean;
  relatedEpisodeIds: string[];
};

export function EpisodeForm({ seriesId, values, published, canReview, siblings }: { seriesId: string; values?: EpisodeFormValues; published: boolean; canReview: boolean; siblings: Option[] }) {
  const refs = (values?.references ?? []).map((r) => [r.title, r.url ?? "", r.citation ?? ""].join(" | ").replace(/( \| )+$/, "")).join("\n");
  return (
    <ActionForm action={values?.id ? updateEpisodeAction : createEpisodeAction} aria-label="Episode details">
      <input type="hidden" name="seriesId" value={seriesId} />
      {values?.id ? <input type="hidden" name="id" value={values.id} /> : null}
      <TextField name="title" label="Title" defaultValue={values?.title} required maxLength={300} />
      <TextField name="slug" label="Address (slug)" defaultValue={values?.slug} optionalLabel hint="Leave blank to generate from the title." />
      <div className="ws-form-grid">
        <TextField name="season" label="Season" type="number" min={1} defaultValue={values?.season?.toString() ?? "1"} optionalLabel />
        <TextField name="episodeNumber" label="Episode number" type="number" min={0} defaultValue={values?.episodeNumber?.toString() ?? ""} hint="Determines order, and so which episodes are free." />
        <TextField name="durationMinutes" label="Duration (minutes)" inputMode="decimal" defaultValue={values?.durationSeconds ? String(Math.round(values.durationSeconds / 6) / 10) : ""} optionalLabel hint="Uploaded audio reports its own length." />
      </div>
      <TextArea name="description" label="Description" defaultValue={values?.description} rows={6} />
      <SelectField
        name="aiDisclosure"
        label="How was the audio produced?"
        defaultValue={values?.aiDisclosure ?? ""}
        options={[
          { value: "", label: "— Choose —" },
          { value: "ai_generated", label: "AI-generated (e.g. NotebookLM Audio Overview)" },
          { value: "ai_assisted", label: "AI-assisted (people with AI tools)" },
          { value: "human_produced", label: "Produced by people" },
        ]}
        hint="Shown to listeners. Required before review."
      />
      <TextArea
        name="references"
        label="References and source material"
        defaultValue={refs}
        rows={5}
        hint='One per line: "Title | https://link | citation". At least one is required before review.'
      />
      <TextArea name="contentNotes" label="Content notes" defaultValue={values?.contentNotes} optionalLabel rows={2} hint="E.g. discusses pregnancy loss; describes surgical procedures." />
      <TextArea name="transcript" label="Transcript" defaultValue={values?.transcript} optionalLabel rows={6} />
      <fieldset className="sn-fieldset" disabled={!canReview}>
        <legend>Access</legend>
        <SelectField
          name="accessOverride"
          label="Free or premium"
          defaultValue={values?.accessOverride ?? "inherit"}
          options={[
            { value: "inherit", label: "Follow the series rule (first N published episodes free)" },
            { value: "free", label: "Always free" },
            { value: "premium", label: "Always premium" },
          ]}
        />
        <Checkbox name="downloadAllowed" label="Allow downloads (only where rights permit)" defaultChecked={values?.downloadAllowed ?? false} hint="Downloads are not offered in this build; the flag is stored for later." />
        {!canReview ? <p className="ws-field__hint">Only a reviewer can change free/premium overrides.</p> : null}
      </fieldset>
      {!canReview ? <input type="hidden" name="accessOverride" value={values?.accessOverride ?? "inherit"} /> : null}
      {siblings.length ? (
        <fieldset className="sn-fieldset">
          <legend>Related episodes</legend>
          {siblings.map((s) => (
            <Checkbox key={s.value} name="relatedEpisodeIds" value={s.value} label={s.label} defaultChecked={values?.relatedEpisodeIds.includes(s.value)} />
          ))}
        </fieldset>
      ) : null}
      {published ? (
        <TextArea name="correctionNote" label="Correction note (required for a live episode)" rows={2} hint="Describe what changed. It is shown publicly under Corrections." />
      ) : null}
      <FormActions>
        <SubmitButton>{values?.id ? "Save episode" : "Create draft episode"}</SubmitButton>
      </FormActions>
    </ActionForm>
  );
}

export function SourceForm({ episodeId, published, current, assets, allowedHosts, uploadsAvailable, directUpload = false }: { episodeId: string; published: boolean; current: { kind: string; url: string | null; assetId: string | null } | null; assets: Option[]; allowedHosts: string[]; uploadsAvailable: boolean; directUpload?: boolean }) {
  const [kind, setKind] = useState(current?.kind ?? (uploadsAvailable ? "uploaded_audio" : "notebooklm_link"));
  const [assetId, setAssetId] = useState(current?.assetId ?? "");
  const [uploadState, setUploadState] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState<Option[]>([]);

  const uploadDirect = async (file: File) => {
    type Result = { ok: boolean; message?: string; ticket?: { assetId: string; uploadUrl: string; contentType: string }; asset?: { id: string; originalName: string; bytes: number } };
    const post = async (url: string, payload: unknown): Promise<Result> => {
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      return (await response.json()) as Result;
    };
    const started = await post("/api/admin/media/ticket", { name: file.name, size: file.size, type: file.type });
    if (!started.ok || !started.ticket) return setUploadState(started.message ?? "The upload could not be started.");
    const { ticket } = started;
    // Straight to private storage, with progress: large NotebookLM audio never passes through a Sonara function.
    const sent = await new Promise<boolean>((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", ticket.uploadUrl);
      xhr.setRequestHeader("Content-Type", ticket.contentType);
      xhr.setRequestHeader("x-upsert", "false");
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) setUploadState(`Uploading ${file.name}… ${Math.round((event.loaded / event.total) * 100)}%`);
      };
      xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300);
      xhr.onerror = () => resolve(false);
      xhr.send(file);
    });
    if (!sent) return setUploadState("The upload to storage failed. Check your connection and try again.");
    setUploadState(`Checking ${file.name}…`);
    const done = await post("/api/admin/media/complete", { assetId: ticket.assetId, name: file.name });
    if (!done.ok || !done.asset) return setUploadState(done.message ?? "The upload could not be verified.");
    setUploaded((list) => [...list, { value: done.asset!.id, label: `${done.asset!.originalName} (just uploaded)` }]);
    setAssetId(done.asset.id);
    setUploadState(`Uploaded ${done.asset.originalName} (${(done.asset.bytes / 1024 / 1024).toFixed(1)} MB). Press “Save audio source” to attach it.`);
  };

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setUploadState(`Uploading ${file.name}…`);
    if (directUpload) {
      try {
        await uploadDirect(file);
      } catch {
        setUploadState("Upload failed. Check your connection.");
      }
      return;
    }
    const body = new FormData();
    body.set("file", file);
    try {
      const response = await fetch("/api/admin/media/upload", { method: "POST", body });
      const result = (await response.json()) as { ok: boolean; message?: string; asset?: { id: string; originalName: string; bytes: number } };
      if (!result.ok || !result.asset) {
        setUploadState(result.message ?? "Upload failed.");
        return;
      }
      setUploaded((list) => [...list, { value: result.asset!.id, label: `${result.asset!.originalName} (just uploaded)` }]);
      setAssetId(result.asset.id);
      setUploadState(`Uploaded ${result.asset.originalName} (${Math.round(result.asset.bytes / 1024)} KB). Save to attach it.`);
    } catch {
      setUploadState("Upload failed. Check your connection.");
    }
  };

  const allAssets = [...uploaded, ...assets];
  return (
    <ActionForm action={attachSourceAction} aria-label="Audio source">
      <input type="hidden" name="id" value={episodeId} />
      <div className="sn-choice" role="radiogroup" aria-label="Source type">
        <label>
          <input type="radio" name="kind" value="notebooklm_link" checked={kind === "notebooklm_link"} onChange={() => setKind("notebooklm_link")} />
          <span>
            <strong>NotebookLM share link</strong>
            <br />
            <span className="sn-small">Listeners leave Sonara and open it on NotebookLM, which may ask them to sign in to Google. Anyone with the link can share it around the paywall.</span>
          </span>
        </label>
        <label>
          <input type="radio" name="kind" value="uploaded_audio" checked={kind === "uploaded_audio"} onChange={() => setKind("uploaded_audio")} disabled={!uploadsAvailable && allAssets.length === 0} />
          <span>
            <strong>Uploaded audio (recommended)</strong>
            <br />
            <span className="sn-small">In NotebookLM, open the Audio Overview’s ⋮ menu → Download, then upload the file here. It plays inside Sonara with full controls, progress and the paywall.</span>
          </span>
        </label>
        <label>
          <input type="radio" name="kind" value="authorised_url" checked={kind === "authorised_url"} onChange={() => setKind("authorised_url")} disabled={allowedHosts.length === 0} />
          <span>
            <strong>Authorised audio URL</strong>
            <br />
            <span className="sn-small">{allowedHosts.length ? `Allowed hosts: ${allowedHosts.join(", ")}` : "No hosts are allow-listed yet (Settings)."}</span>
          </span>
        </label>
      </div>
      {kind === "uploaded_audio" ? (
        <>
          {uploadsAvailable ? (
            <div className="ws-field">
              <label className="ws-field__label" htmlFor="mc-upload">
                Upload an audio file
              </label>
              <input id="mc-upload" type="file" accept="audio/*" onChange={(event) => void upload(event.target.files?.[0])} className="ws-input" aria-describedby="mc-upload-status" />
              <p className="ws-field__hint" id="mc-upload-status" role="status">
                {uploadState ?? "MP3, M4A, AAC, OGG, WAV or WebM audio, as downloaded from NotebookLM. The file contents are checked."}
              </p>
            </div>
          ) : (
            <p className="ws-field__hint">Uploads are disabled: no media storage is configured.</p>
          )}
          <div className="ws-field">
            <label className="ws-field__label" htmlFor="mc-asset">
              Audio file
            </label>
            <select id="mc-asset" name="assetId" className="ws-input ws-input--select" value={assetId} onChange={(event) => setAssetId(event.target.value)}>
              <option value="">— Choose an uploaded file —</option>
              {allAssets.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>
        </>
      ) : (
        <TextField
          name="url"
          label={kind === "notebooklm_link" ? "NotebookLM share link" : "Audio URL"}
          type="url"
          inputMode="url"
          defaultValue={current?.kind === kind ? (current.url ?? "") : ""}
          placeholder={kind === "notebooklm_link" ? "https://notebooklm.link.google/… or https://notebooklm.google.com/notebook/…" : "https://…"}
          hint={kind === "notebooklm_link" ? "NotebookLM share links are stored as external sources; Sonara does not fetch or transcribe them." : "https only; the host must be allow-listed."}
        />
      )}
      {published ? <TextArea name="correctionNote" label="Correction note (required for a live episode)" rows={2} /> : null}
      <FormActions>
        <SubmitButton>Save audio source</SubmitButton>
      </FormActions>
    </ActionForm>
  );
}

export function SourceStatusForm({ episodeId, status, note }: { episodeId: string; status: string; note: string }) {
  return (
    <ActionForm action={sourceStatusAction} aria-label="Source availability">
      <input type="hidden" name="id" value={episodeId} />
      <SelectField
        name="status"
        label="Availability"
        defaultValue={status}
        options={[
          { value: "active", label: "Available" },
          { value: "unavailable", label: "Unavailable (e.g. link stopped working)" },
          { value: "withdrawn", label: "Withdrawn by the provider or rights holder" },
        ]}
      />
      <TextField name="note" label="Note shown to listeners" defaultValue={note} optionalLabel />
      <FormActions>
        <SubmitButton variant="secondary">Update availability</SubmitButton>
      </FormActions>
    </ActionForm>
  );
}

export function EditorialForms({ episodeId, status, actions }: { episodeId: string; status: string; actions: { submit: boolean; review: boolean; publish: boolean; withdraw: boolean; reopen: boolean } }) {
  return (
    <div className="sn-stack">
      {actions.submit && (status === "draft" || status === "changes_requested") ? (
        <ActionForm action={editorialAction_} aria-label="Submit for review">
          <input type="hidden" name="id" value={episodeId} />
          <input type="hidden" name="op" value="submit" />
          <SubmitButton>Submit for review</SubmitButton>
        </ActionForm>
      ) : null}
      {actions.review && status === "in_review" ? (
        <>
          <ActionForm action={editorialAction_} aria-label="Approve">
            <input type="hidden" name="id" value={episodeId} />
            <input type="hidden" name="op" value="approve" />
            <TextArea name="note" label="Approval note" rows={2} optionalLabel />
            <SubmitButton>Approve</SubmitButton>
          </ActionForm>
          <ActionForm action={editorialAction_} aria-label="Request changes">
            <input type="hidden" name="id" value={episodeId} />
            <input type="hidden" name="op" value="request_changes" />
            <TextArea name="note" label="What needs to change?" rows={2} required />
            <SubmitButton variant="secondary">Request changes</SubmitButton>
          </ActionForm>
        </>
      ) : null}
      {actions.publish && status === "approved" ? (
        <ActionForm action={editorialAction_} aria-label="Publish">
          <input type="hidden" name="id" value={episodeId} />
          <input type="hidden" name="op" value="publish" />
          <TextField name="publishAt" label="Publish at (Kampala time)" type="datetime-local" optionalLabel hint="Leave blank to publish now." />
          <SubmitButton>Publish</SubmitButton>
        </ActionForm>
      ) : null}
      {actions.withdraw && (status === "published" || status === "approved" || status === "in_review") ? (
        <ActionForm action={editorialAction_} aria-label="Withdraw" confirm="Withdraw this episode? Listeners will see a withdrawal notice instead of the audio.">
          <input type="hidden" name="id" value={episodeId} />
          <input type="hidden" name="op" value="withdraw" />
          <TextField name="note" label="Reason for withdrawal" required hint="Shown publicly on the episode page." />
          <SubmitButton variant="danger">Withdraw episode</SubmitButton>
        </ActionForm>
      ) : null}
      {actions.reopen && (status === "withdrawn" || status === "changes_requested") ? (
        <ActionForm action={editorialAction_} aria-label="Reopen">
          <input type="hidden" name="id" value={episodeId} />
          <input type="hidden" name="op" value="reopen" />
          <SubmitButton variant="secondary">Reopen as draft</SubmitButton>
        </ActionForm>
      ) : null}
    </div>
  );
}

export function MedicalReviewForm({ episodeId }: { episodeId: string }) {
  return (
    <ActionForm action={medicalReviewAction} aria-label="Record medical review" resetOnSuccess>
      <input type="hidden" name="id" value={episodeId} />
      <TextArea name="note" label="What did you review?" rows={2} hint="E.g. checked doses against the Uganda Clinical Guidelines 2023. Your name and the date are shown to listeners." />
      <SubmitButton variant="secondary">Record medical review</SubmitButton>
    </ActionForm>
  );
}

export function CategoryCreateForm() {
  return (
    <ActionForm action={createCategoryAction} aria-label="New category" resetOnSuccess>
      <div className="ws-form-grid">
        <TextField name="name" label="Name" required />
        <SelectField name="kind" label="Type" options={[{ value: "topic", label: "Topic" }, { value: "specialty", label: "Specialty" }]} />
      </div>
      <TextField name="slug" label="Address (slug)" optionalLabel />
      <TextField name="description" label="Description" optionalLabel />
      <SubmitButton>Add category</SubmitButton>
    </ActionForm>
  );
}

export function CategoryRowForms({ id, name, description, kind, active, first, last }: { id: string; name: string; description: string; kind: string; active: boolean; first: boolean; last: boolean }) {
  const op = (value: string, label: ReactNode, disabled = false) => (
    <ActionForm action={updateCategoryAction} className="sn-inline-form">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="op" value={value} />
      <SubmitButton variant="ghost" disabled={disabled}>
        {label}
      </SubmitButton>
    </ActionForm>
  );
  return (
    <div className="sn-row">
      {op("up", <>↑<span className="sr-only"> Move {name} up</span></>, first)}
      {op("down", <>↓<span className="sr-only"> Move {name} down</span></>, last)}
      {op(active ? "deactivate" : "activate", active ? "Deactivate" : "Activate")}
      <details>
        <summary className="kt-btn kt-btn--ghost kt-btn--sm">Edit</summary>
        <ActionForm action={updateCategoryAction} aria-label={`Edit ${name}`}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="op" value="save" />
          <TextField name="name" label="Name" defaultValue={name} required />
          <SelectField name="kind" label="Type" defaultValue={kind} options={[{ value: "topic", label: "Topic" }, { value: "specialty", label: "Specialty" }]} />
          <TextField name="description" label="Description" defaultValue={description} optionalLabel />
          <SubmitButton>Save</SubmitButton>
        </ActionForm>
      </details>
    </div>
  );
}

function CopyPrompt({ label, prompt }: { label: string; prompt: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <details className="sn-fieldset">
      <summary className="sn-small">{label}</summary>
      <pre className="mc-prompt">{prompt}</pre>
      <button
        type="button"
        className="kt-btn kt-btn--ghost kt-btn--sm"
        onClick={() => {
          void navigator.clipboard?.writeText(prompt).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          });
        }}
      >
        {copied ? "Copied" : "Copy prompt"}
      </button>
    </details>
  );
}

/**
 * Flashcards and quiz for an episode, pasted from the episode's NotebookLM
 * notebook. Parsed live for a preview; parsed again on the server on save.
 */
export function StudyForm({ episodeId, title, published, flashcards, quiz, notes, aiAvailable }: { episodeId: string; title: string; published: boolean; flashcards: string; quiz: string; notes: string; aiAvailable: boolean }) {
  const [cardText, setCardText] = useState(flashcards);
  const [quizText, setQuizText] = useState(quiz);
  const [notesText, setNotesText] = useState(notes);
  const [notesState, setNotesState] = useState<string | null>(null);
  const [drafting, setDrafting] = useState<string | null>(null);

  const loadNotes = async (file: File | undefined) => {
    if (!file) return;
    if (!/\.(md|markdown|txt)$/i.test(file.name)) return setNotesState("Choose a .md (Markdown) or .txt file.");
    if (file.size > 400_000) return setNotesState("That file is too large (notes are limited to about 200,000 characters).");
    const text = await file.text();
    setNotesText(text);
    setNotesState(`Loaded ${file.name} (${text.length.toLocaleString()} characters). Press “Save study materials” to keep it.`);
  };

  const draftQuiz = async () => {
    setDrafting("Groq is writing questions from your notes…");
    try {
      const response = await fetch("/api/admin/chronicles/draft-quiz", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, notes: notesText, count: 10 }) });
      const result = (await response.json()) as { ok: boolean; message?: string; text?: string; count?: number };
      if (!result.ok || !result.text) return setDrafting(result.message ?? "Drafting failed.");
      setQuizText((current) => (current.trim() ? `${current.trim()}\n\n${result.text}` : result.text!));
      setDrafting(`Added ${result.count} drafted question${result.count === 1 ? "" : "s"} to the quiz box. Check every answer before saving — you are the medical reviewer.`);
    } catch {
      setDrafting("Drafting failed. Check your connection.");
    }
  };
  const cards = useMemo(() => parseFlashcards(cardText), [cardText]);
  const questions = useMemo(() => parseQuiz(quizText), [quizText]);
  const problems = [...cards.issues.map((i) => ({ where: "Flashcards", ...i })), ...questions.issues.map((i) => ({ where: "Quiz", ...i }))];
  return (
    <ActionForm action={saveStudyAction} aria-label="Study materials">
      <input type="hidden" name="id" value={episodeId} />
      <p className="sn-small" style={{ marginTop: 0 }}>
        NotebookLM does not let other sites read a notebook, so copy the material across: open the notebook’s <strong>Studio</strong> panel (Flashcards, Quiz) and
        copy the text, or paste one of the prompts below into the notebook’s chat and copy its answer. Listeners study it inside Sonara, behind the same paywall as
        the audio.
      </p>
      <div className="ws-field">
        <label className="ws-field__label" htmlFor="mc-notes">
          Study notes (Markdown) <span className="sn-small">— subscribers only · the AI tutor quizzes from these</span>
        </label>
        <input type="file" accept=".md,.markdown,.txt,text/markdown,text/plain" className="ws-input" aria-label="Load notes from a .md file" onChange={(event) => void loadNotes(event.target.files?.[0])} />
        <textarea
          id="mc-notes"
          name="notes"
          className="ws-input ws-input--area mc-study-input"
          rows={10}
          value={notesText}
          onChange={(event) => setNotesText(event.target.value)}
          placeholder={"# Intestinal obstruction\n\n## Causes\n- Adhesions (commonest in adults)\n- Hernias\n\n## Clinical features\n- Colicky pain, vomiting, distension, absolute constipation"}
        />
        <p className="ws-field__hint" role="status">
          {notesState ?? `${notesText.length.toLocaleString()} characters. Subscribers read these on the episode page; the AI tutor uses only these notes.`}
        </p>
      </div>
      <div className="ws-form-grid">
        <div className="ws-field">
          <label className="ws-field__label" htmlFor="mc-flashcards">
            Flashcards <span className="sn-small">({cards.items.length} recognised)</span>
          </label>
          <textarea
            id="mc-flashcards"
            name="flashcards"
            className="ws-input ws-input--area mc-study-input"
            rows={14}
            value={cardText}
            onChange={(event) => setCardText(event.target.value)}
            placeholder={"Q: Commonest cause of adult small-bowel obstruction?\nA: Post-operative adhesions.\n\nQ: Coffee-bean sign on X-ray?\nA: Sigmoid volvulus."}
            spellCheck
          />
          <CopyPrompt label="Prompt for NotebookLM chat: flashcards" prompt={NOTEBOOKLM_FLASHCARD_PROMPT} />
        </div>
        <div className="ws-field">
          <label className="ws-field__label" htmlFor="mc-quiz">
            Quiz <span className="sn-small">({questions.items.length} question{questions.items.length === 1 ? "" : "s"} recognised)</span>
          </label>
          <textarea
            id="mc-quiz"
            name="quiz"
            className="ws-input ws-input--area mc-study-input"
            rows={14}
            value={quizText}
            onChange={(event) => setQuizText(event.target.value)}
            placeholder={"1. Which sign suggests strangulation?\nA) Intermittent colic\nB) Constant pain with tachycardia\nC) Borborygmi\nAnswer: B\nExplanation: Ischaemic bowel causes continuous pain and systemic upset."}
            spellCheck
          />
          <CopyPrompt label="Prompt for NotebookLM chat: quiz" prompt={NOTEBOOKLM_QUIZ_PROMPT} />
          <button type="button" className="kt-btn kt-btn--secondary kt-btn--sm" onClick={() => void draftQuiz()} disabled={!aiAvailable || notesText.trim().length < 200 || drafting === "Groq is writing questions from your notes…"}>
            Draft quiz from notes with Groq
          </button>
          <p className="ws-field__hint" role="status">
            {drafting ?? (aiAvailable ? "Writes 10 questions from the notes above into this box for you to review." : "Groq is not configured (GROQ_API_KEY).")}
          </p>
        </div>
      </div>
      {problems.length ? (
        <div className="ws-notice ws-notice--warn sn-notice" role="status">
          <strong>{problems.length} item{problems.length === 1 ? "" : "s"} need attention</strong>
          <ul className="sn-small">
            {problems.slice(0, 8).map((p, i) => (
              <li key={i}>
                {p.where}
                {p.line ? `, line ${p.line}` : ""}: {p.message}
              </li>
            ))}
          </ul>
        </div>
      ) : cards.items.length || questions.items.length ? (
        <p className="sn-small" role="status">
          Ready: {cards.items.length} flashcard{cards.items.length === 1 ? "" : "s"} and {questions.items.length} question{questions.items.length === 1 ? "" : "s"}. Clear both boxes and save to remove them.
        </p>
      ) : null}
      {published ? <TextArea name="correctionNote" label="Correction note (required for a live episode)" rows={2} hint="E.g. “Added flashcards and a 10-question quiz.” Shown publicly under Corrections." /> : null}
      <FormActions>
        <SubmitButton disabled={problems.length > 0}>Save study materials</SubmitButton>
      </FormActions>
    </ActionForm>
  );
}
