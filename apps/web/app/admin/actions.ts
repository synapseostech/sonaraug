"use server";

/**
 * Admin server actions. Each one resolves the viewer on the server and calls a
 * service function that re-checks the permission and writes an audit record.
 */
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseFlashcards, parseQuiz } from "@kito/chronicles";
import type { PlatformRole } from "@kito/types";
import { ALL_PLATFORM_ROLES } from "@kito/auth";
import type { FormState } from "../../components/sonara/forms.tsx";
import { guard } from "../../lib/server/actions-util.ts";
import { AccessError, getViewer, type Viewer } from "../../lib/server/auth.ts";
import { appendAudit } from "../../lib/server/audit.ts";
import {
  CommandError,
  attachSource,
  createCategory,
  createEpisode,
  createSeries,
  editorialAction,
  recordMedicalReview,
  saveStudy,
  setSeriesStatus,
  setSourceStatus,
  updateCategory,
  updateEpisode,
  updateSeries,
  type EpisodeInput,
  type SeriesInput,
} from "../../lib/server/chronicles.ts";
import {
  createProviderPlan,
  decideRefund,
  grantOverride,
  reconcileNow,
  revokeOverride,
  runBillingJobs,
  savePlan,
  savePromo,
} from "../../lib/server/billing.ts";
import { sendForgedWebhook } from "../../lib/server/flutterwave-sim.ts";
import { requestId } from "../../lib/server/request.ts";
import { read, transact } from "../../lib/server/store.ts";
import { changeRole, setAccountStatus } from "../../lib/server/users.ts";
import { staffCan } from "@kito/auth";

async function staff(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect("/auth/login?next=/admin");
  if (!viewer.isStaff) throw new AccessError("admin:access");
  return viewer;
}

const optionalInt = (min: number, max: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v.trim() === "" ? null : Number(v)))
    .refine((v) => v === null || (Number.isInteger(v) && v >= min && v <= max), `Enter a whole number from ${min} to ${max}.`);

const slugField = z
  .string()
  .optional()
  .transform((v) => (v ?? "").trim().toLowerCase())
  .refine((v) => v === "" || /^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/.test(v), "Lowercase letters, numbers and hyphens only.");

/* ----------------------------------------------------------- categories */

export async function createCategoryAction(_: FormState, formData: FormData): Promise<FormState> {
  return guard(formData, async () => {
    const viewer = await staff();
    const input = z
      .object({ name: z.string().trim().min(2, "Name is required.").max(80), slug: slugField, description: z.string().max(400).default(""), kind: z.enum(["topic", "specialty"]) })
      .parse(Object.fromEntries(formData));
    await createCategory(viewer, input);
    revalidatePath("/admin/medical-chronicles/categories");
    return { ok: true, message: `Category "${input.name}" created.` };
  });
}

export async function updateCategoryAction(_: FormState, formData: FormData): Promise<FormState> {
  return guard(formData, async () => {
    const viewer = await staff();
    const id = String(formData.get("id") ?? "");
    const op = String(formData.get("op") ?? "save");
    if (op === "up" || op === "down") await updateCategory(viewer, id, { move: op });
    else if (op === "deactivate" || op === "activate") await updateCategory(viewer, id, { isActive: op === "activate" });
    else {
      const input = z.object({ name: z.string().trim().min(2).max(80), description: z.string().max(400).default(""), kind: z.enum(["topic", "specialty"]) }).parse(Object.fromEntries(formData));
      await updateCategory(viewer, id, input);
    }
    revalidatePath("/admin/medical-chronicles/categories");
    return { ok: true, message: "Category updated." };
  });
}

/* ---------------------------------------------------------------- series */

const seriesSchema = z.object({
  title: z.string().trim().min(2, "Title is required.").max(200),
  slug: slugField,
  description: z.string().max(5000).default(""),
  categoryId: z.string().optional().transform((v) => v || null),
  specialtyId: z.string().optional().transform((v) => v || null),
  editorDisplay: z.string().max(120).default(""),
  hostDisplay: z.string().max(120).default(""),
  requiresSubscription: z.string().optional().transform((v) => v === "on"),
  freeEpisodeAllowance: optionalInt(0, 500),
  seoTitle: z.string().max(120).default(""),
  seoDescription: z.string().max(300).default(""),
  relatedSeriesIds: z.union([z.string(), z.array(z.string())]).optional().transform((v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]).filter(Boolean)),
});

function seriesInput(formData: FormData): SeriesInput {
  const raw: Record<string, unknown> = Object.fromEntries(formData);
  raw.relatedSeriesIds = formData.getAll("relatedSeriesIds").map(String);
  const parsed = seriesSchema.parse(raw);
  return { ...parsed, coverAssetId: null };
}

export async function createSeriesAction(_: FormState, formData: FormData): Promise<FormState> {
  return guard(formData, async () => {
    const viewer = await staff();
    const series = await createSeries(viewer, seriesInput(formData));
    redirect(`/admin/medical-chronicles/series/${series.id}?created=1`);
  });
}

export async function updateSeriesAction(_: FormState, formData: FormData): Promise<FormState> {
  return guard(formData, async () => {
    const viewer = await staff();
    const id = String(formData.get("id") ?? "");
    await updateSeries(viewer, id, seriesInput(formData));
    revalidatePath(`/admin/medical-chronicles/series/${id}`);
    return { ok: true, message: "Series saved." };
  });
}

export async function seriesStatusAction(_: FormState, formData: FormData): Promise<FormState> {
  return guard(formData, async () => {
    const viewer = await staff();
    const id = String(formData.get("id") ?? "");
    const status = z.enum(["draft", "published", "archived"]).parse(formData.get("status"));
    await setSeriesStatus(viewer, id, status);
    redirect(`/admin/medical-chronicles/series/${id}?done=${status}`);
  });
}

/* --------------------------------------------------------------- episodes */

const referencesField = z
  .string()
  .optional()
  .transform((text) =>
    (text ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 50)
      .map((line) => {
        const [title = "", url = "", citation = ""] = line.split("|").map((p) => p.trim());
        return { title: title.slice(0, 300), url: /^https:\/\/\S+$/.test(url) ? url.slice(0, 500) : null, citation: citation.slice(0, 300) || null };
      }),
  );

const episodeSchema = z.object({
  title: z.string().trim().min(2, "Title is required.").max(300),
  slug: slugField,
  description: z.string().max(10000).default(""),
  season: optionalInt(1, 999),
  episodeNumber: optionalInt(0, 99999),
  durationMinutes: z.string().optional().transform((v) => (v && v.trim() ? Math.round(Number(v) * 60) : null)).refine((v) => v === null || (Number.isFinite(v) && v >= 0 && v <= 86400), "Enter minutes, e.g. 24.5"),
  transcript: z.string().max(200000).default(""),
  contentNotes: z.string().max(2000).default(""),
  references: referencesField,
  aiDisclosure: z.enum(["", "human_produced", "ai_assisted", "ai_generated"]).transform((v) => (v === "" ? null : v)),
  accessOverride: z.enum(["inherit", "free", "premium"]).default("inherit"),
  downloadAllowed: z.string().optional().transform((v) => v === "on"),
  relatedEpisodeIds: z.array(z.string()).default([]),
});

function episodeInput(formData: FormData): EpisodeInput {
  const raw: Record<string, unknown> = Object.fromEntries(formData);
  raw.relatedEpisodeIds = formData.getAll("relatedEpisodeIds").map(String);
  const p = episodeSchema.parse(raw);
  return {
    title: p.title,
    slug: p.slug,
    description: p.description,
    season: p.season,
    episodeNumber: p.episodeNumber,
    durationSeconds: p.durationMinutes,
    transcript: p.transcript,
    contentNotes: p.contentNotes,
    references: p.references,
    aiDisclosure: p.aiDisclosure,
    accessOverride: p.accessOverride,
    downloadAllowed: p.downloadAllowed,
    coverAssetId: null,
    relatedEpisodeIds: p.relatedEpisodeIds,
  };
}

export async function createEpisodeAction(_: FormState, formData: FormData): Promise<FormState> {
  return guard(formData, async () => {
    const viewer = await staff();
    const episode = await createEpisode(viewer, String(formData.get("seriesId") ?? ""), episodeInput(formData));
    redirect(`/admin/medical-chronicles/episodes/${episode.id}?created=1`);
  });
}

export async function updateEpisodeAction(_: FormState, formData: FormData): Promise<FormState> {
  return guard(formData, async () => {
    const viewer = await staff();
    const id = String(formData.get("id") ?? "");
    const note = String(formData.get("correctionNote") ?? "").trim() || null;
    await updateEpisode(viewer, id, episodeInput(formData), note);
    revalidatePath(`/admin/medical-chronicles/episodes/${id}`);
    return { ok: true, message: note ? "Correction saved and published on the episode page." : "Episode saved." };
  });
}

export async function attachSourceAction(_: FormState, formData: FormData): Promise<FormState> {
  return guard(formData, async () => {
    const viewer = await staff();
    const id = String(formData.get("id") ?? "");
    const kind = z.enum(["notebooklm_link", "uploaded_audio", "authorised_url"]).parse(formData.get("kind"));
    const note = String(formData.get("correctionNote") ?? "").trim() || null;
    const input =
      kind === "uploaded_audio"
        ? { kind, assetId: String(formData.get("assetId") ?? "") }
        : { kind, url: String(formData.get("url") ?? "") };
    await attachSource(viewer, id, input as Parameters<typeof attachSource>[2], note);
    revalidatePath(`/admin/medical-chronicles/episodes/${id}`);
    return { ok: true, message: "Audio source saved." };
  });
}

export async function saveStudyAction(_: FormState, formData: FormData): Promise<FormState> {
  return guard(formData, async () => {
    const viewer = await staff();
    const id = String(formData.get("id") ?? "");
    const note = String(formData.get("correctionNote") ?? "").trim() || null;
    // Parsed again on the server: the browser preview is a convenience, not a trust boundary.
    const cards = parseFlashcards(String(formData.get("flashcards") ?? ""));
    const quiz = parseQuiz(String(formData.get("quiz") ?? ""));
    const problems = [...cards.issues.map((i) => `Flashcards: ${i.message}`), ...quiz.issues.map((i) => `Quiz: ${i.message}`)];
    if (problems.length) throw new CommandError(`Fix these before saving — ${problems.slice(0, 3).join(" · ")}${problems.length > 3 ? ` (and ${problems.length - 3} more)` : ""}`, "flashcards");
    const notes = String(formData.get("notes") ?? "");
    const saved = await saveStudy(viewer, id, { flashcards: cards.items, quiz: quiz.items, notes }, note);
    revalidatePath(`/admin/medical-chronicles/episodes/${id}`);
    return {
      ok: true,
      message:
        saved.flashcards + saved.quiz + saved.notes === 0
          ? "Study materials removed."
          : `Saved ${saved.flashcards} flashcard${saved.flashcards === 1 ? "" : "s"} and ${saved.quiz} quiz question${saved.quiz === 1 ? "" : "s"}${saved.notes ? `, plus ${saved.notes.toLocaleString()} characters of notes` : ""}.`,
    };
  });
}

export async function sourceStatusAction(_: FormState, formData: FormData): Promise<FormState> {
  return guard(formData, async () => {
    const viewer = await staff();
    const id = String(formData.get("id") ?? "");
    const status = z.enum(["active", "unavailable", "withdrawn"]).parse(formData.get("status"));
    await setSourceStatus(viewer, id, status, String(formData.get("note") ?? ""));
    revalidatePath(`/admin/medical-chronicles/episodes/${id}`);
    return { ok: true, message: status === "active" ? "Source marked available." : "Listeners now see an unavailable notice instead of the audio." };
  });
}

export async function editorialAction_(_: FormState, formData: FormData): Promise<FormState> {
  return guard(formData, async () => {
    const viewer = await staff();
    const id = String(formData.get("id") ?? "");
    const type = z.enum(["submit", "request_changes", "approve", "publish", "withdraw", "reopen"]).parse(formData.get("op"));
    const note = String(formData.get("note") ?? "");
    const publishAtLocal = String(formData.get("publishAt") ?? "").trim();
    // datetime-local is entered in Kampala time (UTC+3, no DST).
    const publishAt = publishAtLocal ? new Date(`${publishAtLocal}:00+03:00`).toISOString() : null;
    const action =
      type === "request_changes" ? { type, note } : type === "withdraw" ? { type, reason: note } : type === "approve" ? { type, note } : type === "publish" ? { type, publishAt } : { type };
    const event = await editorialAction(viewer, id, action);
    // Redirect so the outcome survives the form disappearing (the available actions change with the status).
    redirect(`/admin/medical-chronicles/episodes/${id}?done=${event}`);
  });
}

export async function medicalReviewAction(_: FormState, formData: FormData): Promise<FormState> {
  return guard(formData, async () => {
    const viewer = await staff();
    const id = String(formData.get("id") ?? "");
    await recordMedicalReview(viewer, id, String(formData.get("note") ?? ""));
    revalidatePath(`/admin/medical-chronicles/episodes/${id}`);
    return { ok: true, message: "Medical review recorded. The date and your name now appear on the episode page." };
  });
}

/* ------------------------------------------------------------- commerce */

const planSchema = z.object({
  id: z.string().optional().transform((v) => v || undefined),
  audience: z.enum(["listener", "creator"]),
  code: z.string().trim().toLowerCase(),
  name: z.string().trim().min(2, "Name is required.").max(80),
  description: z.string().max(400).default(""),
  interval: z.enum(["monthly", "annual"]),
  amount: z.string().transform((v) => Number(v.replace(/[, ]/g, ""))).refine((v) => Number.isSafeInteger(v) && v > 0, "Enter a whole, positive amount."),
  currency: z.enum(["UGX", "KES", "TZS", "RWF", "USD"]),
  active: z.string().optional().transform((v) => v === "on"),
  trialDays: z.string().default("0").transform(Number).refine((v) => Number.isInteger(v) && v >= 0 && v <= 90, "0–90 days."),
  features: z.string().default("").transform((v) => v.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 12)),
  priceIsPlaceholder: z.string().optional().transform((v) => v === "on"),
  sortOrder: z.string().default("0").transform(Number),
  maxShows: z.string().optional(),
  maxEpisodes: z.string().optional(),
  uploadAllowanceMb: z.string().optional(),
  storageMb: z.string().optional(),
  canPublish: z.string().optional(),
  analytics: z.enum(["none", "basic", "full"]).optional(),
  promotion: z.string().optional(),
  supportLevel: z.enum(["community", "standard", "priority"]).optional(),
});

export async function savePlanAction(_: FormState, formData: FormData): Promise<FormState> {
  return guard(formData, async () => {
    const viewer = await staff();
    const p = planSchema.parse(Object.fromEntries(formData));
    const n = (v: string | undefined) => Math.max(0, Math.floor(Number(v ?? 0)) || 0);
    await savePlan(viewer, {
      id: p.id,
      audience: p.audience,
      code: p.code,
      name: p.name,
      description: p.description,
      interval: p.interval,
      amount: p.amount,
      currency: p.currency,
      active: p.active,
      trialDays: p.trialDays,
      features: p.features,
      priceIsPlaceholder: p.priceIsPlaceholder,
      sortOrder: p.sortOrder,
      creatorLimits:
        p.audience === "creator"
          ? { maxShows: n(p.maxShows), maxEpisodes: n(p.maxEpisodes), uploadAllowanceMb: n(p.uploadAllowanceMb), storageMb: n(p.storageMb), canPublish: p.canPublish === "on", analytics: p.analytics ?? "basic", promotion: p.promotion === "on", supportLevel: p.supportLevel ?? "standard" }
          : null,
    });
    revalidatePath("/admin/subscriptions");
    return { ok: true, message: `Plan "${p.name}" saved.` };
  });
}

export async function providerPlanAction(_: FormState, formData: FormData): Promise<FormState> {
  return guard(formData, async () => {
    const viewer = await staff();
    const id = await createProviderPlan(viewer, String(formData.get("planId") ?? ""));
    revalidatePath("/admin/subscriptions");
    return { ok: true, message: `Recurring card plan created with Flutterwave (id ${id}).` };
  });
}

export async function savePromoAction(_: FormState, formData: FormData): Promise<FormState> {
  return guard(formData, async () => {
    const viewer = await staff();
    const p = z
      .object({
        code: z.string().trim().min(3),
        description: z.string().max(200).default(""),
        percentOff: z.string().optional().transform((v) => (v && v.trim() ? Number(v) : null)),
        amountOff: z.string().optional().transform((v) => (v && v.trim() ? Number(v) : null)),
        currency: z.string().optional().transform((v) => v || null),
        validUntil: z.string().optional().transform((v) => (v ? new Date(`${v}T23:59:59+03:00`).toISOString() : null)),
        maxRedemptions: z.string().optional().transform((v) => (v && v.trim() ? Number(v) : null)),
        active: z.string().optional().transform((v) => v === "on"),
      })
      .parse(Object.fromEntries(formData));
    await savePromo(viewer, { ...p, planIds: null, validFrom: null });
    revalidatePath("/admin/subscriptions");
    return { ok: true, message: `Promotional code ${p.code.toUpperCase()} saved.` };
  });
}

export async function overrideAction(_: FormState, formData: FormData): Promise<FormState> {
  return guard(formData, async () => {
    const viewer = await staff();
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const data = await read();
    const user = data.users.find((u) => u.email === email || u.id === email);
    if (!user) throw new CommandError("No account with that email.", "email");
    const until = String(formData.get("validUntil") ?? "");
    await grantOverride(viewer, {
      userId: user.id,
      audience: z.enum(["listener", "creator"]).parse(formData.get("audience")),
      effect: z.enum(["grant", "revoke"]).parse(formData.get("effect")),
      validUntil: until ? new Date(`${until}T23:59:59+03:00`).toISOString() : null,
      reason: String(formData.get("reason") ?? ""),
      planId: String(formData.get("planId") ?? "") || null,
    });
    revalidatePath("/admin/subscriptions");
    return { ok: true, message: `Entitlement adjustment recorded for ${user.email}. It is audited.` };
  });
}

export async function revokeOverrideAction(_: FormState, formData: FormData): Promise<FormState> {
  return guard(formData, async () => {
    const viewer = await staff();
    await revokeOverride(viewer, String(formData.get("id") ?? ""), String(formData.get("reason") ?? ""));
    revalidatePath("/admin/subscriptions");
    return { ok: true, message: "Override revoked." };
  });
}

export async function billingJobsAction(_: FormState, formData: FormData): Promise<FormState> {
  return guard(formData, async () => {
    const viewer = await staff();
    const result = await runBillingJobs(viewer);
    revalidatePath("/admin/subscriptions");
    return { ok: true, message: `Billing jobs ran: ${result.reminders} renewal reminder(s), ${result.expired} subscription(s) marked expired.` };
  });
}

export async function reconcileAction(_: FormState, formData: FormData): Promise<FormState> {
  return guard(formData, async () => {
    const viewer = await staff();
    const result = await reconcileNow(viewer);
    revalidatePath("/admin/payments");
    return { ok: true, message: `Re-verified ${result.checked} pending transaction(s): ${result.changed} changed, ${result.errors} could not be reached.` };
  });
}

export async function refundDecisionAction(_: FormState, formData: FormData): Promise<FormState> {
  return guard(formData, async () => {
    const viewer = await staff();
    const decision = z.enum(["approved", "rejected", "refunded"]).parse(formData.get("decision"));
    await decideRefund(viewer, String(formData.get("id") ?? ""), decision, String(formData.get("note") ?? ""));
    revalidatePath("/admin/payments");
    return { ok: true, message: `Refund ${decision}. Money is returned through the Flutterwave dashboard; record "refunded" once it has been sent.` };
  });
}

export async function forgedWebhookAction(_: FormState, formData: FormData): Promise<FormState> {
  return guard(formData, async () => {
    const viewer = await staff();
    if (!staffCan(viewer.roles, "payments:reconcile")) throw new AccessError("payments:reconcile");
    const status = await sendForgedWebhook();
    revalidatePath("/admin/payments");
    return { ok: status === 401, message: status === 401 ? "Forged webhook was rejected with HTTP 401 and logged." : `Unexpected response: HTTP ${status}.` };
  });
}

/* ----------------------------------------------------------------- users */

export async function roleAction(_: FormState, formData: FormData): Promise<FormState> {
  return guard(formData, async () => {
    const viewer = await staff();
    const role = String(formData.get("role") ?? "") as PlatformRole;
    if (!ALL_PLATFORM_ROLES.includes(role)) throw new CommandError("Unknown role.", "role");
    const change = formData.get("change") === "revoke" ? "revoke" : "grant";
    const target = String(formData.get("userId") ?? "");
    await changeRole(viewer, target, role, change, String(formData.get("reason") ?? ""));
    revalidatePath(`/admin/users/${target}`);
    return { ok: true, message: `Role ${role} ${change === "grant" ? "granted" : "revoked"}.` };
  });
}

export async function accountStatusAction(_: FormState, formData: FormData): Promise<FormState> {
  return guard(formData, async () => {
    const viewer = await staff();
    const target = String(formData.get("userId") ?? "");
    const status = formData.get("status") === "suspended" ? "suspended" : "active";
    await setAccountStatus(viewer, target, status, String(formData.get("reason") ?? ""));
    revalidatePath(`/admin/users/${target}`);
    return { ok: true, message: status === "suspended" ? "Account suspended and signed out." : "Account reactivated." };
  });
}

/* -------------------------------------------------------------- settings */

export async function saveSettingsAction(_: FormState, formData: FormData): Promise<FormState> {
  return guard(formData, async () => {
    const viewer = await staff();
    if (!staffCan(viewer.roles, "settings:manage")) throw new AccessError("settings:manage");
    const s = z
      .object({
        defaultFreeEpisodeAllowance: z.string().transform(Number).refine((v) => Number.isInteger(v) && v >= 0 && v <= 500, "0–500."),
        graceDays: z.string().transform(Number).refine((v) => Number.isInteger(v) && v >= 0 && v <= 30, "0–30 days."),
        freeRequiresAccount: z.string().optional().transform((v) => v === "on"),
        trialsEnabled: z.string().optional().transform((v) => v === "on"),
        maintenanceMode: z.string().optional().transform((v) => v === "on"),
        livePaymentsEnabled: z.string().optional().transform((v) => v === "on"),
        authorisedAudioHosts: z.string().default("").transform((v) => [...new Set(v.split(/[\s,]+/).map((h) => h.trim().toLowerCase()).filter(Boolean))]),
        termsVersion: z.string().trim().min(3).max(40),
        privacyVersion: z.string().trim().min(3).max(40),
        reason: z.string().trim().min(5, "Give a reason for the change; it is audited."),
      })
      .parse(Object.fromEntries(formData));
    for (const host of s.authorisedAudioHosts) {
      if (!/^(?=.{3,253}$)([a-z0-9-]{1,63}\.)+[a-z]{2,63}$/.test(host)) throw new CommandError(`"${host}" is not a valid host name.`, "authorisedAudioHosts");
    }
    const reqId = await requestId();
    await transact((data) => {
      const actor = data.users.find((u) => u.id === viewer.id);
      if (!actor) throw new AccessError("settings:manage");
      if (s.livePaymentsEnabled !== data.settings.livePaymentsEnabled && !actor.roles.includes("super_admin")) {
        throw new CommandError("Only a super administrator can turn live payments on or off.", "livePaymentsEnabled");
      }
      const before = { ...data.settings };
      const { reason, ...next } = s;
      data.settings = { ...data.settings, ...next, defaultCurrency: data.settings.defaultCurrency, regions: data.settings.regions };
      appendAudit(data, { actor: { id: actor.id, roles: actor.roles }, action: "settings.updated", entityType: "platform_settings", entityId: null, before, after: data.settings, reason }, reqId);
    });
    revalidatePath("/admin/settings");
    return { ok: true, message: "Settings saved and audited." };
  });
}
