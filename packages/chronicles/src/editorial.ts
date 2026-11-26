/**
 * Medical Chronicles editorial workflow.
 *
 *   draft ──submit──▶ in_review ──approve──▶ approved ──publish──▶ published
 *     ▲                  │                                 │           │
 *     │            request_changes                  (publishAt in   withdraw
 *     │                  ▼                           the future =      ▼
 *     └──────────── changes_requested               scheduled)    withdrawn ──reopen──▶ draft
 *
 * Rules enforced here (and again in Postgres, see migration 0120):
 *   - Nobody approves or publishes content they last edited or submitted (no self-approval).
 *   - Publishing needs an approval of the *current* version; editing after approval
 *     sends the episode back to draft.
 *   - Submission needs an audio source, at least one reference and an AI disclosure.
 *   - Editing a published episode is a correction: it needs a public correction note.
 *   - Publishing does not mean "medically verified". Verification is a separate,
 *     explicit review record with a named reviewer and date.
 */

export type EditorialStatus = "draft" | "in_review" | "changes_requested" | "approved" | "published" | "withdrawn";

export type AiDisclosure = "human_produced" | "ai_assisted" | "ai_generated";

export const AI_DISCLOSURE_LABEL: Record<AiDisclosure, string> = {
  human_produced: "Produced by people",
  ai_assisted: "AI-assisted",
  ai_generated: "AI-generated audio",
};

export type Reference = { readonly title: string; readonly url?: string | null; readonly citation?: string | null };

export type EditorialEpisode = {
  readonly status: EditorialStatus;
  readonly version: number;
  readonly title: string;
  readonly description: string;
  readonly hasSource: boolean;
  readonly references: readonly Reference[];
  readonly aiDisclosure: AiDisclosure | null;
  readonly submittedBy: string | null;
  readonly lastEditedBy: string | null;
  readonly approvedVersion: number | null;
  readonly publishedAt: string | null;
};

export type EditorialActor = {
  readonly id: string;
  readonly canEdit: boolean;
  readonly canReview: boolean;
};

export type EditorialAction =
  | { type: "submit" }
  | { type: "request_changes"; note: string }
  | { type: "approve"; note?: string }
  | { type: "publish"; publishAt?: string | null }
  | { type: "withdraw"; reason: string }
  | { type: "reopen" };

export type EditorialPatch = Partial<{
  status: EditorialStatus;
  submittedBy: string | null;
  submittedAt: string | null;
  approvedVersion: number | null;
  approvedBy: string | null;
  approvedAt: string | null;
  publishedAt: string | null;
  withdrawnAt: string | null;
  withdrawnReason: string | null;
}>;

export type EditorialError =
  | "forbidden"
  | "invalid_transition"
  | "self_approval"
  | "missing_source"
  | "missing_references"
  | "missing_ai_disclosure"
  | "missing_description"
  | "stale_approval"
  | "note_required"
  | "invalid_date";

export type TransitionResult =
  | { ok: true; patch: EditorialPatch; event: string }
  | { ok: false; error: EditorialError; message: string };

const ERRORS: Record<EditorialError, string> = {
  forbidden: "Your role does not allow this action.",
  invalid_transition: "That action is not available in the episode's current state.",
  self_approval: "You cannot approve or publish an episode you edited or submitted. Ask another reviewer.",
  missing_source: "Attach an audio source before submitting.",
  missing_references: "Add at least one reference or source material before submitting.",
  missing_ai_disclosure: "State whether the audio is AI-generated, AI-assisted or produced by people.",
  missing_description: "Add a description before submitting.",
  stale_approval: "The episode changed after it was approved. It must be reviewed again.",
  note_required: "A note explaining the decision is required.",
  invalid_date: "The publication date is not valid.",
};

const no = (error: EditorialError): TransitionResult => ({ ok: false, error, message: ERRORS[error] });

/** Problems that block submission, for showing a checklist before the button is pressed. */
export function submissionBlockers(episode: EditorialEpisode): EditorialError[] {
  const blockers: EditorialError[] = [];
  if (!episode.hasSource) blockers.push("missing_source");
  if (episode.references.filter((r) => r.title.trim()).length === 0) blockers.push("missing_references");
  if (!episode.aiDisclosure) blockers.push("missing_ai_disclosure");
  if (!episode.description.trim()) blockers.push("missing_description");
  return blockers;
}

export const describeEditorialError = (error: EditorialError): string => ERRORS[error];

function isSelf(episode: EditorialEpisode, actor: EditorialActor): boolean {
  return episode.lastEditedBy === actor.id || episode.submittedBy === actor.id;
}

export function transition(episode: EditorialEpisode, action: EditorialAction, actor: EditorialActor, now: Date): TransitionResult {
  const at = now.toISOString();
  switch (action.type) {
    case "submit": {
      if (!actor.canEdit) return no("forbidden");
      if (episode.status !== "draft" && episode.status !== "changes_requested") return no("invalid_transition");
      const blockers = submissionBlockers(episode);
      if (blockers[0]) return no(blockers[0]);
      return { ok: true, event: "submitted", patch: { status: "in_review", submittedBy: actor.id, submittedAt: at } };
    }
    case "request_changes": {
      if (!actor.canReview) return no("forbidden");
      if (episode.status !== "in_review") return no("invalid_transition");
      if (!action.note.trim()) return no("note_required");
      return { ok: true, event: "changes_requested", patch: { status: "changes_requested" } };
    }
    case "approve": {
      if (!actor.canReview) return no("forbidden");
      if (episode.status !== "in_review") return no("invalid_transition");
      if (isSelf(episode, actor)) return no("self_approval");
      return {
        ok: true,
        event: "approved",
        patch: { status: "approved", approvedVersion: episode.version, approvedBy: actor.id, approvedAt: at },
      };
    }
    case "publish": {
      if (!actor.canReview) return no("forbidden");
      if (episode.status !== "approved") return no("invalid_transition");
      if (isSelf(episode, actor)) return no("self_approval");
      if (episode.approvedVersion !== episode.version) return no("stale_approval");
      let publishAt = at;
      if (action.publishAt) {
        const parsed = Date.parse(action.publishAt);
        if (!Number.isFinite(parsed)) return no("invalid_date");
        publishAt = new Date(Math.max(parsed, now.getTime())).toISOString();
      }
      return { ok: true, event: publishAt > at ? "scheduled" : "published", patch: { status: "published", publishedAt: publishAt } };
    }
    case "withdraw": {
      if (!actor.canReview) return no("forbidden");
      if (episode.status !== "published" && episode.status !== "approved" && episode.status !== "in_review") {
        return no("invalid_transition");
      }
      if (!action.reason.trim()) return no("note_required");
      return {
        ok: true,
        event: "withdrawn",
        patch: { status: "withdrawn", withdrawnAt: at, withdrawnReason: action.reason.trim() },
      };
    }
    case "reopen": {
      if (!actor.canEdit) return no("forbidden");
      if (episode.status !== "withdrawn" && episode.status !== "changes_requested") return no("invalid_transition");
      return {
        ok: true,
        event: "reopened",
        patch: { status: "draft", approvedVersion: null, approvedBy: null, approvedAt: null, publishedAt: null },
      };
    }
  }
}

/** Fields whose change alters what a listener hears or reads. */
export const SUBSTANTIVE_FIELDS = ["title", "description", "source", "study", "references", "transcript", "contentNotes", "aiDisclosure"] as const;
export type SubstantiveField = (typeof SUBSTANTIVE_FIELDS)[number];

export type EditOutcome =
  | { ok: true; patch: EditorialPatch & { version: number }; isCorrection: boolean }
  | { ok: false; error: EditorialError | "correction_note_required"; message: string };

/**
 * What happens to workflow state when content is edited.
 *  - draft / changes_requested: version bumps, nothing else.
 *  - in_review / approved: version bumps and the episode returns to draft (approval no longer applies).
 *  - published: allowed only with a correction note; stays published; recorded as a correction.
 *  - withdrawn: editing is refused until reopened.
 */
export function applyEdit(
  episode: EditorialEpisode,
  changed: readonly SubstantiveField[],
  actor: EditorialActor,
  correctionNote: string | null,
): EditOutcome {
  if (!actor.canEdit) return { ok: false, error: "forbidden", message: ERRORS.forbidden };
  if (episode.status === "withdrawn") return { ok: false, error: "invalid_transition", message: "Reopen the episode before editing it." };
  if (changed.length === 0) return { ok: true, patch: { version: episode.version }, isCorrection: false };
  const version = episode.version + 1;
  if (episode.status === "published") {
    if (!correctionNote?.trim()) {
      return {
        ok: false,
        error: "correction_note_required",
        message: "This episode is live. Describe the correction; it will be shown to listeners.",
      };
    }
    return { ok: true, patch: { version }, isCorrection: true };
  }
  if (episode.status === "in_review" || episode.status === "approved") {
    return {
      ok: true,
      patch: { version, status: "draft", approvedVersion: null, approvedBy: null, approvedAt: null, submittedBy: null, submittedAt: null },
      isCorrection: false,
    };
  }
  return { ok: true, patch: { version }, isCorrection: false };
}

export const EDITORIAL_LABEL: Record<EditorialStatus, string> = {
  draft: "Draft",
  in_review: "In review",
  changes_requested: "Changes requested",
  approved: "Approved",
  published: "Published",
  withdrawn: "Withdrawn",
};

export const MEDICAL_DISCLAIMER =
  "Medical Chronicles is educational content for learners. It is not medical advice and does not replace professional clinical judgement, local guidelines or a consultation with a qualified health worker.";

export const AI_DISCLAIMER =
  "This programme's audio was generated with AI tools from the listed source material. AI audio can contain errors; check the references.";
