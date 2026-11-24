/**
 * Medical Chronicles service: public queries, editorial commands, playback.
 *
 * Access is decided here, on the server, with @kito/chronicles. Pages render the
 * decision; the audio source is handed out only by `resolvePlayback`, and
 * uploaded audio is served only by /api/media/[id] after the same check.
 */
import {
  applyEdit,
  decideEpisodeAccess,
  episodeTier,
  isPubliclyLive,
  parseAudioSource,
  publishedOrder,
  SOURCE_PROVIDERS,
  transition,
  uniqueSlug,
  type AccessDecision,
  type EditorialAction,
  type EditorialEpisode,
  type SourceInput,
  type SubstantiveField,
} from "@kito/chronicles";
import { staffCan } from "@kito/auth";
import type { Viewer } from "./auth.ts";
import { CommandError } from "./errors.ts";
import { appendAudit } from "./audit.ts";
import { requestId } from "./request.ts";
import { randomId } from "./crypto.ts";
import { viewerAccess } from "./entitlements.ts";
import { notify } from "./notify.ts";
import { asViewer, fillPlayableSource, playCounts, readData, scope, where, writeData, type Load } from "./data.ts";
import type { DataShape, McCategory, McEpisode, McEpisodeSource, McSeries } from "./types.ts";

export type EpisodeView = {
  episode: McEpisode;
  series: McSeries;
  position: number | null;
  tier: "free" | "premium";
  access: AccessDecision;
  sourceKind: McEpisodeSource["kind"] | null;
  sourceStatus: McEpisodeSource["status"] | null;
  control: "sonara" | "provider" | null;
};

const seriesIsPublic = (s: McSeries, now: Date) => s.status === "published" && Boolean(s.publishedAt) && Date.parse(s.publishedAt!) <= now.getTime();

function toOrdering(e: McEpisode) {
  return { id: e.id, seriesId: e.seriesId, season: e.season, episodeNumber: e.episodeNumber, publishedAt: e.publishedAt, status: e.status, accessOverride: e.accessOverride };
}

function viewOf(data: Readonly<DataShape>, episode: McEpisode, series: McSeries, viewer: Viewer | null, now: Date): EpisodeView {
  const all = data.mcEpisodes.filter((e) => e.seriesId === series.id).map(toOrdering);
  const order = publishedOrder(all, series.id, now);
  const index = order.findIndex((e) => e.id === episode.id);
  const config = { id: series.id, requiresSubscription: series.requiresSubscription, freeEpisodeAllowance: series.freeEpisodeAllowance };
  const access = decideEpisodeAccess({
    episode: toOrdering(episode),
    series: { ...config, status: seriesIsPublic(series, now) ? "published" : "draft" },
    allEpisodes: all,
    viewer: viewerAccess(data, viewer, now),
    now,
    platformDefaultAllowance: data.settings.defaultFreeEpisodeAllowance,
    freeRequiresAccount: data.settings.freeRequiresAccount,
  });
  const kind = episode.source?.kind ?? null;
  return {
    episode,
    series,
    position: index === -1 ? null : index + 1,
    tier: episodeTier(toOrdering(episode), config, all, now, data.settings.defaultFreeEpisodeAllowance),
    access,
    sourceKind: kind,
    sourceStatus: episode.source?.status ?? null,
    control: kind ? SOURCE_PROVIDERS[kind].control : null,
  };
}

/* ------------------------------------------------------------------- scopes */
// What each operation reads. In the Supabase backend only these rows are loaded
// (as the caller, so RLS applies); in the dev backend the whole store is used.

/** The caller's own subscriptions and overrides: needed to decide premium access. */
const ownEntitlements = (viewer: Viewer | null): Load =>
  viewer ? { subscriptions: where("t.profile_id = $1", viewer.id), overrides: where("t.profile_id = $1", viewer.id) } : {};
const catalogueLoad = (viewer: Viewer | null): Load => ({ mcCategories: true, mcSeries: true, mcEpisodes: true, ...ownEntitlements(viewer) });
/** Everything a Medical Chronicles editor works with (staff RLS shows unpublished rows and sources). */
const editorLoad: Load = { mcCategories: true, mcSeries: true, mcEpisodes: true };

/* ------------------------------------------------------------------ queries */

export async function publicCatalogue(viewer: Viewer | null) {
  return publicCatalogueFrom(await readData(scope(asViewer(viewer), catalogueLoad(viewer))), viewer, await playCounts());
}

export function publicCatalogueFrom(data: Readonly<DataShape>, viewer: Viewer | null, playCounts?: ReadonlyMap<string, number>) {
  const now = new Date();
  const categories = data.mcCategories.filter((c) => c.isActive).sort((a, b) => a.sortOrder - b.sortOrder);
  const series = data.mcSeries.filter((s) => seriesIsPublic(s, now));
  const seriesIds = new Set(series.map((s) => s.id));
  const episodes = data.mcEpisodes
    .filter((e) => seriesIds.has(e.seriesId) && isPubliclyLive(e, now))
    .map((e) => viewOf(data, e, series.find((s) => s.id === e.seriesId)!, viewer, now))
    .sort((a, b) => (b.episode.publishedAt ?? "").localeCompare(a.episode.publishedAt ?? ""));
  const listens = new Map<string, number>(playCounts ?? []);
  if (!playCounts) for (const entry of data.listening) listens.set(entry.episodeId, (listens.get(entry.episodeId) ?? 0) + 1);
  return { categories, series, episodes, listens, settings: data.settings };
}

export async function seriesBySlug(slug: string, viewer: Viewer | null) {
  return seriesBySlugFrom(await readData(scope(asViewer(viewer), catalogueLoad(viewer))), slug, viewer);
}

export function seriesBySlugFrom(data: Readonly<DataShape>, slug: string, viewer: Viewer | null) {
  const now = new Date();
  const series = data.mcSeries.find((s) => s.slug === slug);
  if (!series) return null;
  const preview = viewer ? staffCan(viewer.roles, "chronicles:edit") : false;
  if (!seriesIsPublic(series, now) && !preview) return null;
  const episodes = data.mcEpisodes
    .filter((e) => e.seriesId === series.id && (isPubliclyLive(e, now) || preview))
    .map((e) => viewOf(data, e, series, viewer, now))
    .sort((a, b) => (a.position ?? 9_999) - (b.position ?? 9_999) || (a.episode.episodeNumber ?? 0) - (b.episode.episodeNumber ?? 0));
  const category = data.mcCategories.find((c) => c.id === series.categoryId) ?? null;
  const specialty = data.mcCategories.find((c) => c.id === series.specialtyId) ?? null;
  const related = data.mcSeries.filter((s) => series.relatedSeriesIds.includes(s.id) && seriesIsPublic(s, now));
  return { series, episodes, category, specialty, related, preview: !seriesIsPublic(series, now), settings: data.settings };
}

export async function episodeBySlug(slug: string, viewer: Viewer | null) {
  const data = (await readData(
    scope(asViewer(viewer), {
      ...catalogueLoad(viewer),
      mcCorrections: where("t.episode_id in (select id from public.mc_episodes where slug = $1)", slug),
      ...(viewer ? { saved: where("t.profile_id = $1", viewer.id) } : {}),
      // Display name of the medical reviewer (read by the platform: profiles are private).
      users: where("t.id in (select last_reviewed_by from public.mc_episodes where slug = $1)", slug),
    }),
  )) as DataShape;
  const episode = data.mcEpisodes.find((e) => e.slug === slug);
  if (episode) await fillPlayableSource(data, viewer, episode.id);
  return episodeBySlugFrom(data, slug, viewer);
}

export function episodeBySlugFrom(data: Readonly<DataShape>, slug: string, viewer: Viewer | null) {
  const now = new Date();
  const episode = data.mcEpisodes.find((e) => e.slug === slug);
  if (!episode) return null;
  const series = data.mcSeries.find((s) => s.id === episode.seriesId);
  if (!series) return null;
  const preview = viewer ? staffCan(viewer.roles, "chronicles:edit") : false;
  const live = isPubliclyLive(episode, now) && seriesIsPublic(series, now);
  // Withdrawn episodes keep a public page explaining the withdrawal, without audio.
  if (!live && !preview && episode.status !== "withdrawn") return null;
  if (episode.status === "withdrawn" && !episode.publishedAt && !preview) return null;
  const view = viewOf(data, episode, series, viewer, now);
  const siblings = publishedOrder(data.mcEpisodes.filter((e) => e.seriesId === series.id), series.id, now);
  const index = siblings.findIndex((e) => e.id === episode.id);
  const corrections = data.mcCorrections.filter((c) => c.episodeId === episode.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const reviewer = episode.lastReviewedBy ? data.users.find((u) => u.id === episode.lastReviewedBy)?.displayName ?? "Sonara reviewer" : null;
  const related = data.mcEpisodes.filter((e) => episode.relatedEpisodeIds.includes(e.id) && isPubliclyLive(e, now));
  const saved = viewer ? data.saved.some((s) => s.userId === viewer.id && s.episodeId === episode.id) : false;
  return {
    view,
    previous: index > 0 ? siblings[index - 1] ?? null : null,
    next: index >= 0 && index + 1 < siblings.length ? siblings[index + 1] ?? null : null,
    corrections,
    reviewer,
    related,
    saved,
    preview: !live,
    category: data.mcCategories.find((c) => c.id === series.categoryId) ?? null,
  };
}

export type ChronicleQuery = { q?: string; category?: string; access?: "free" | "premium" | "" };

export async function searchChronicles(viewer: Viewer | null, query: ChronicleQuery) {
  return searchChroniclesFrom(await readData(scope(asViewer(viewer), catalogueLoad(viewer))), viewer, query, await playCounts());
}

export function searchChroniclesFrom(data: Readonly<DataShape>, viewer: Viewer | null, query: ChronicleQuery, playCounts?: ReadonlyMap<string, number>) {
  const { categories, series, episodes } = publicCatalogueFrom(data, viewer, playCounts);
  const needle = (query.q ?? "").trim().toLowerCase();
  const category = categories.find((c) => c.slug === query.category) ?? null;
  const matchText = (text: string) => !needle || text.toLowerCase().includes(needle);
  const seriesMatches = series.filter(
    (s) => (!category || s.categoryId === category.id || s.specialtyId === category.id) && matchText(`${s.title} ${s.description} ${s.hostDisplay} ${s.editorDisplay}`),
  );
  const episodeMatches = episodes.filter(
    (e) =>
      (!category || e.series.categoryId === category.id || e.series.specialtyId === category.id) &&
      (!query.access || e.tier === query.access) &&
      matchText(`${e.episode.title} ${e.episode.description} ${e.series.title} ${e.episode.references.map((r) => r.title).join(" ")}`),
  );
  return { categories, category, series: seriesMatches, episodes: episodeMatches };
}

/* ------------------------------------------------------------------ playback */

export type PlaybackResult =
  | { ok: true; mode: "sonara"; url: string; durationSeconds: number | null; tier: "free" | "premium" }
  | { ok: true; mode: "external"; provider: "notebooklm"; url: string; tier: "free" | "premium" }
  | { ok: false; reason: AccessDecision["reason"] | "source_unavailable" | "no_source" | "not_found"; message: string };

export async function resolvePlayback(episodeId: string, viewer: Viewer | null): Promise<PlaybackResult> {
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(episodeId)) return { ok: false, reason: "not_found", message: "Episode not found." };
  const data = (await readData(scope(asViewer(viewer), catalogueLoad(viewer)))) as DataShape;
  // Supabase: the database must independently grant access (mc_episode_playback).
  const databaseAllows = await fillPlayableSource(data, viewer, episodeId);
  const now = new Date();
  const episode = data.mcEpisodes.find((e) => e.id === episodeId);
  const series = episode ? data.mcSeries.find((s) => s.id === episode.seriesId) : undefined;
  if (!episode || !series) return { ok: false, reason: "not_found", message: "Episode not found." };
  const view = viewOf(data, episode, series, viewer, now);
  if (!view.access.allowed || !databaseAllows) {
    const messages: Record<string, string> = {
      subscription_required: "This episode needs a Sonara listener subscription.",
      sign_in_required: "Sign in or create a free account to listen.",
      not_published: "This episode is not published.",
      withdrawn: "This episode has been withdrawn.",
    };
    const reason = view.access.allowed ? "subscription_required" : view.access.reason;
    return { ok: false, reason, message: messages[reason] ?? "Not available." };
  }
  const source = episode.source;
  if (!source) return { ok: false, reason: "no_source", message: "No audio has been attached to this episode yet." };
  if (source.status !== "active" && view.access.reason !== "staff_preview") {
    return { ok: false, reason: "source_unavailable", message: source.statusNote || "The audio for this episode is currently unavailable." };
  }

  if (viewer) {
    await writeData(scope(asViewer(viewer), {}), (draft) => {
      draft.listening.push({ id: randomId("lst"), userId: viewer.id, episodeId, startedAt: now.toISOString(), lastPositionSeconds: 0, durationSeconds: episode.durationSeconds, control: SOURCE_PROVIDERS[source.kind].control });
      if (draft.listening.length > 20_000) draft.listening.splice(0, draft.listening.length - 20_000);
    });
  }

  switch (source.kind) {
    case "uploaded_audio":
      return { ok: true, mode: "sonara", url: `/api/media/${source.assetId}?e=${episode.id}`, durationSeconds: episode.durationSeconds, tier: view.tier };
    case "authorised_url":
      return { ok: true, mode: "sonara", url: source.url!, durationSeconds: episode.durationSeconds, tier: view.tier };
    case "notebooklm_link":
      return { ok: true, mode: "external", provider: "notebooklm", url: source.url!, tier: view.tier };
  }
}

export type PlaybackDescriptor =
  | { state: "ready"; mode: "sonara"; url: string }
  | { state: "ready"; mode: "external"; provider: "notebooklm"; url: string }
  | { state: "locked"; reason: AccessDecision["reason"] }
  | { state: "unavailable"; note: string }
  | { state: "no_source" };

/**
 * What the episode page may render, computed on the server from the access
 * decision. A URL is included only when access is allowed. Uploaded audio URLs
 * are re-checked by /api/media on every request, so sharing one grants nothing.
 */
export function playbackDescriptor(view: EpisodeView): PlaybackDescriptor {
  if (!view.access.allowed) return { state: "locked", reason: view.access.reason };
  const source = view.episode.source;
  if (!source) return { state: "no_source" };
  if (source.status !== "active" && view.access.reason !== "staff_preview") {
    return { state: "unavailable", note: source.statusNote || "The audio for this episode is currently unavailable." };
  }
  if (source.kind === "notebooklm_link") return { state: "ready", mode: "external", provider: "notebooklm", url: source.url! };
  if (source.kind === "uploaded_audio") return { state: "ready", mode: "sonara", url: `/api/media/${source.assetId}?e=${view.episode.id}` };
  return { state: "ready", mode: "sonara", url: source.url! };
}

/** Server-side check used by the media route for uploaded audio. */
export async function canStreamAsset(assetId: string, episodeId: string, viewer: Viewer | null): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(episodeId)) return false;
  const data = (await readData(
    scope(asViewer(viewer), { ...catalogueLoad(viewer), media: where("t.id::text = $1", assetId) }),
  )) as DataShape;
  await fillPlayableSource(data, viewer, episodeId);
  return canStreamAssetFrom(data, assetId, episodeId, viewer);
}

export function canStreamAssetFrom(data: Readonly<DataShape>, assetId: string, episodeId: string, viewer: Viewer | null): boolean {
  const episode = data.mcEpisodes.find((e) => e.id === episodeId);
  if (!episode || episode.source?.kind !== "uploaded_audio" || episode.source.assetId !== assetId) {
    // Unattached assets are visible to editors only (for preview after upload).
    return viewer ? staffCan(viewer.roles, "chronicles:edit") && data.media.some((m) => m.id === assetId) : false;
  }
  const series = data.mcSeries.find((s) => s.id === episode.seriesId);
  if (!series) return false;
  const view = viewOf(data, episode, series, viewer, new Date());
  return view.access.allowed && (episode.source.status === "active" || view.access.reason === "staff_preview");
}

export async function recordProgress(viewer: Viewer, episodeId: string, positionSeconds: number): Promise<void> {
  if (!Number.isFinite(positionSeconds) || positionSeconds < 0 || positionSeconds > 86_400) return;
  await writeData(scope(asViewer(viewer), { listening: where("t.profile_id = $1 and t.episode_id::text = $2 and t.control = 'sonara'", viewer.id, episodeId) }), (data) => {
    const entry = [...data.listening].sort((a, b) => a.startedAt.localeCompare(b.startedAt)).reverse().find((l) => l.userId === viewer.id && l.episodeId === episodeId && l.control === "sonara");
    if (entry) entry.lastPositionSeconds = Math.floor(positionSeconds);
  });
}

export async function toggleSaved(viewer: Viewer, episodeId: string): Promise<boolean> {
  const load: Load = { mcEpisodes: where("t.id::text = $1", episodeId), saved: where("t.profile_id = $1 and t.episode_id::text = $2", viewer.id, episodeId) };
  return writeData(scope(asViewer(viewer), load, false), (data) => {
    if (!data.mcEpisodes.some((e) => e.id === episodeId)) throw new Error("Episode not found");
    const index = data.saved.findIndex((s) => s.userId === viewer.id && s.episodeId === episodeId);
    if (index >= 0) {
      data.saved.splice(index, 1);
      return false;
    }
    data.saved.push({ userId: viewer.id, episodeId, savedAt: new Date().toISOString() });
    return true;
  });
}

/* --------------------------------------------------------------- admin reads */

export async function adminChronicles(viewer: Viewer) {
  return adminChroniclesFrom(
    await readData(scope(asViewer(viewer), { ...editorLoad, mcCorrections: true, mcEditorialEvents: true, media: where("t.kind = 'audio'"), users: where("t.id in (select profile_id from public.platform_roles)") })),
  );
}

export function adminChroniclesFrom(data: Readonly<DataShape>) {
  return {
    categories: [...data.mcCategories].sort((a, b) => a.sortOrder - b.sortOrder),
    series: [...data.mcSeries].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    episodes: [...data.mcEpisodes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    corrections: data.mcCorrections,
    events: data.mcEditorialEvents,
    media: data.media.filter((m) => m.kind === "audio"),
    users: data.users.map((u) => ({ id: u.id, displayName: u.displayName })),
    settings: data.settings,
  };
}

export async function adminEpisode(viewer: Viewer, id: string) {
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(id)) return null;
  const byEpisode = where("t.episode_id::text = $1", id);
  return adminEpisodeFrom(
    await readData(
      scope(asViewer(viewer), {
        ...editorLoad,
        mcVersions: byEpisode,
        mcEditorialEvents: byEpisode,
        mcCorrections: byEpisode,
        media: where("t.kind = 'audio'"),
        users: where("t.id in (select profile_id from public.platform_roles)"),
      }),
    ),
    id,
  );
}

export function adminEpisodeFrom(data: Readonly<DataShape>, id: string) {
  const episode = data.mcEpisodes.find((e) => e.id === id);
  if (!episode) return null;
  const series = data.mcSeries.find((s) => s.id === episode.seriesId) ?? null;
  const now = new Date();
  const all = data.mcEpisodes.filter((e) => e.seriesId === episode.seriesId).map(toOrdering);
  const tier = series ? episodeTier(toOrdering(episode), { id: series.id, requiresSubscription: series.requiresSubscription, freeEpisodeAllowance: series.freeEpisodeAllowance }, all, now, data.settings.defaultFreeEpisodeAllowance) : "premium";
  const name = (uid: string | null) => (uid ? data.users.find((u) => u.id === uid)?.displayName ?? uid : null);
  return {
    episode,
    series,
    tier,
    versions: data.mcVersions.filter((v) => v.episodeId === id).sort((a, b) => b.version - a.version),
    events: data.mcEditorialEvents.filter((e) => e.episodeId === id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    corrections: data.mcCorrections.filter((c) => c.episodeId === id),
    asset: episode.source?.assetId ? data.media.find((m) => m.id === episode.source!.assetId) ?? null : null,
    media: data.media.filter((m) => m.kind === "audio"),
    name,
    allowedHosts: data.settings.authorisedAudioHosts,
    seriesEpisodes: data.mcEpisodes.filter((e) => e.seriesId === episode.seriesId && e.id !== id),
  };
}

/* ------------------------------------------------------------ admin commands */

export { CommandError } from "./errors.ts";

const actorOf = (viewer: Viewer) => ({ id: viewer.id, roles: viewer.roles });

export type CategoryInput = { name: string; slug?: string; description: string; kind: McCategory["kind"] };

export async function createCategory(viewer: Viewer, input: CategoryInput): Promise<McCategory> {
  if (!staffCan(viewer.roles, "chronicles:categories")) throw new CommandError("Only administrators manage categories.");
  const reqId = await requestId();
  return writeData(scope(asViewer(viewer), { mcCategories: true }), (data) => {
    const slug = uniqueSlug(input.slug || input.name, new Set(data.mcCategories.map((c) => c.slug)));
    const now = new Date().toISOString();
    const category: McCategory = {
      id: randomId("cat"),
      slug,
      name: input.name.trim(),
      description: input.description.trim(),
      kind: input.kind,
      sortOrder: Math.max(0, ...data.mcCategories.map((c) => c.sortOrder)) + 10,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    data.mcCategories.push(category);
    appendAudit(data, { actor: actorOf(viewer), action: "mc.category.created", entityType: "mc_category", entityId: category.id, after: category }, reqId);
    return category;
  });
}

export async function updateCategory(viewer: Viewer, id: string, patch: Partial<Pick<McCategory, "name" | "description" | "kind" | "isActive">> & { move?: "up" | "down" }): Promise<void> {
  if (!staffCan(viewer.roles, "chronicles:categories")) throw new CommandError("Only administrators manage categories.");
  const reqId = await requestId();
  await writeData(scope(asViewer(viewer), { mcCategories: true }), (data) => {
    const sorted = [...data.mcCategories].sort((a, b) => a.sortOrder - b.sortOrder);
    const index = sorted.findIndex((c) => c.id === id);
    const category = sorted[index];
    if (!category) throw new CommandError("Category not found.");
    const before = { ...category };
    if (patch.move) {
      const swapWith = sorted[patch.move === "up" ? index - 1 : index + 1];
      if (swapWith) [category.sortOrder, swapWith.sortOrder] = [swapWith.sortOrder, category.sortOrder];
    }
    if (patch.name !== undefined) category.name = patch.name.trim();
    if (patch.description !== undefined) category.description = patch.description.trim();
    if (patch.kind) category.kind = patch.kind;
    if (patch.isActive !== undefined) category.isActive = patch.isActive;
    category.updatedAt = new Date().toISOString();
    appendAudit(data, { actor: actorOf(viewer), action: "mc.category.updated", entityType: "mc_category", entityId: id, before, after: category }, reqId);
  });
}

export type SeriesInput = {
  title: string;
  slug?: string;
  description: string;
  categoryId: string | null;
  specialtyId: string | null;
  editorDisplay: string;
  hostDisplay: string;
  requiresSubscription: boolean;
  freeEpisodeAllowance: number | null;
  seoTitle: string;
  seoDescription: string;
  coverAssetId: string | null;
  relatedSeriesIds: string[];
};

function checkCategories(data: DataShape, input: Pick<SeriesInput, "categoryId" | "specialtyId">) {
  for (const [field, id] of [["categoryId", input.categoryId], ["specialtyId", input.specialtyId]] as const) {
    if (id && !data.mcCategories.some((c) => c.id === id)) throw new CommandError("Unknown category.", field);
  }
}

export async function createSeries(viewer: Viewer, input: SeriesInput): Promise<McSeries> {
  if (!staffCan(viewer.roles, "chronicles:edit")) throw new CommandError("Your role cannot create series.");
  const reqId = await requestId();
  return writeData(scope(asViewer(viewer), { mcCategories: true, mcSeries: true }), (data) => {
    checkCategories(data, input);
    const slug = uniqueSlug(input.slug || input.title, new Set(data.mcSeries.map((s) => s.slug)));
    const now = new Date().toISOString();
    const series: McSeries = {
      id: randomId("ser"),
      ...input,
      // After the spread: a blank slug field must not overwrite the generated one.
      slug,
      title: input.title.trim(),
      status: "draft",
      publishedAt: null,
      isSample: false,
      createdBy: viewer.id,
      createdAt: now,
      updatedAt: now,
    };
    data.mcSeries.push(series);
    appendAudit(data, { actor: actorOf(viewer), action: "mc.series.created", entityType: "mc_series", entityId: series.id, after: series }, reqId);
    return series;
  });
}

export async function updateSeries(viewer: Viewer, id: string, input: SeriesInput): Promise<void> {
  if (!staffCan(viewer.roles, "chronicles:edit")) throw new CommandError("Your role cannot edit series.");
  const reqId = await requestId();
  await writeData(scope(asViewer(viewer), { mcCategories: true, mcSeries: true }), (data) => {
    const series = data.mcSeries.find((s) => s.id === id);
    if (!series) throw new CommandError("Series not found.");
    checkCategories(data, input);
    const before = { ...series };
    const accessChanged = series.requiresSubscription !== input.requiresSubscription || series.freeEpisodeAllowance !== input.freeEpisodeAllowance;
    if (accessChanged && !staffCan(viewer.roles, "chronicles:review")) throw new CommandError("Only a reviewer or administrator can change a series' access rules.", "freeEpisodeAllowance");
    if (input.slug && input.slug !== series.slug) {
      const taken = new Set(data.mcSeries.filter((s) => s.id !== id).map((s) => s.slug));
      if (taken.has(input.slug)) throw new CommandError("That address is already used by another series.", "slug");
      series.slug = input.slug;
    }
    Object.assign(series, { ...input, slug: series.slug, title: input.title.trim(), relatedSeriesIds: input.relatedSeriesIds.filter((r) => r !== id), updatedAt: new Date().toISOString() });
    appendAudit(data, { actor: actorOf(viewer), action: accessChanged ? "mc.series.access_changed" : "mc.series.updated", entityType: "mc_series", entityId: id, before, after: series }, reqId);
  });
}

export async function setSeriesStatus(viewer: Viewer, id: string, status: McSeries["status"]): Promise<void> {
  if (!staffCan(viewer.roles, "chronicles:review")) throw new CommandError("Only a reviewer or administrator can publish or archive a series.");
  const reqId = await requestId();
  await writeData(scope(asViewer(viewer), { mcSeries: where("t.id::text = $1", id) }), (data) => {
    const series = data.mcSeries.find((s) => s.id === id);
    if (!series) throw new CommandError("Series not found.");
    const before = { status: series.status, publishedAt: series.publishedAt };
    series.status = status;
    if (status === "published") series.publishedAt ??= new Date().toISOString();
    series.updatedAt = new Date().toISOString();
    appendAudit(data, { actor: actorOf(viewer), action: `mc.series.${status}`, entityType: "mc_series", entityId: id, before, after: { status, publishedAt: series.publishedAt } }, reqId);
  });
}

export type EpisodeInput = {
  title: string;
  slug?: string;
  description: string;
  season: number | null;
  episodeNumber: number | null;
  durationSeconds: number | null;
  transcript: string;
  contentNotes: string;
  references: McEpisode["references"];
  aiDisclosure: McEpisode["aiDisclosure"];
  accessOverride: McEpisode["accessOverride"];
  downloadAllowed: boolean;
  coverAssetId: string | null;
  relatedEpisodeIds: string[];
};

function snapshot(data: DataShape, episode: McEpisode, editorId: string, note: string) {
  data.mcVersions.push({ id: randomId("ver"), episodeId: episode.id, version: episode.version, snapshot: structuredClone(episode), changeNote: note, editedBy: editorId, createdAt: new Date().toISOString() });
}

function checkOrdering(data: DataShape, seriesId: string, season: number | null, episodeNumber: number | null, exceptId: string | null) {
  if (episodeNumber === null) return;
  const clash = data.mcEpisodes.find((e) => e.seriesId === seriesId && e.id !== exceptId && (e.season ?? 1) === (season ?? 1) && e.episodeNumber === episodeNumber);
  if (clash) throw new CommandError(`Season ${season ?? 1}, episode ${episodeNumber} already exists ("${clash.title}").`, "episodeNumber");
}

export async function createEpisode(viewer: Viewer, seriesId: string, input: EpisodeInput): Promise<McEpisode> {
  if (!staffCan(viewer.roles, "chronicles:edit")) throw new CommandError("Your role cannot create episodes.");
  const reqId = await requestId();
  return writeData(scope(asViewer(viewer), editorLoad), (data) => {
    if (!data.mcSeries.some((s) => s.id === seriesId)) throw new CommandError("Series not found.");
    checkOrdering(data, seriesId, input.season, input.episodeNumber, null);
    if (input.accessOverride !== "inherit" && !staffCan(viewer.roles, "chronicles:review")) throw new CommandError("Only a reviewer can set free/premium overrides.", "accessOverride");
    const now = new Date().toISOString();
    const episode: McEpisode = {
      id: randomId("epi"),
      seriesId,
      ...input,
      // After the spread: a blank slug field must not overwrite the generated one.
      slug: uniqueSlug(input.slug || input.title, new Set(data.mcEpisodes.map((e) => e.slug))),
      title: input.title.trim(),
      status: "draft",
      version: 1,
      source: null,
      submittedBy: null,
      submittedAt: null,
      lastEditedBy: viewer.id,
      approvedVersion: null,
      approvedBy: null,
      approvedAt: null,
      publishedAt: null,
      withdrawnAt: null,
      withdrawnReason: null,
      lastReviewedAt: null,
      lastReviewedBy: null,
      isSample: false,
      createdBy: viewer.id,
      createdAt: now,
      updatedAt: now,
    };
    data.mcEpisodes.push(episode);
    snapshot(data, episode, viewer.id, "Created");
    appendAudit(data, { actor: actorOf(viewer), action: "mc.episode.created", entityType: "mc_episode", entityId: episode.id, after: episode }, reqId);
    return episode;
  });
}

function editorialOf(e: McEpisode): EditorialEpisode {
  return {
    status: e.status,
    version: e.version,
    title: e.title,
    description: e.description,
    hasSource: Boolean(e.source),
    references: e.references,
    aiDisclosure: e.aiDisclosure,
    submittedBy: e.submittedBy,
    lastEditedBy: e.lastEditedBy,
    approvedVersion: e.approvedVersion,
    publishedAt: e.publishedAt,
  };
}

const editorialActor = (viewer: Viewer) => ({ id: viewer.id, canEdit: staffCan(viewer.roles, "chronicles:edit"), canReview: staffCan(viewer.roles, "chronicles:review") });

function changedFields(before: McEpisode, input: EpisodeInput): SubstantiveField[] {
  const fields: SubstantiveField[] = [];
  if (before.title !== input.title.trim()) fields.push("title");
  if (before.description !== input.description) fields.push("description");
  if (JSON.stringify(before.references) !== JSON.stringify(input.references)) fields.push("references");
  if (before.transcript !== input.transcript) fields.push("transcript");
  if (before.contentNotes !== input.contentNotes) fields.push("contentNotes");
  if (before.aiDisclosure !== input.aiDisclosure) fields.push("aiDisclosure");
  return fields;
}

function commitEdit(data: DataShape, viewer: Viewer, episode: McEpisode, changed: SubstantiveField[], correctionNote: string | null, apply: () => void, reqId: string, action: string) {
  const outcome = applyEdit(editorialOf(episode), changed, editorialActor(viewer), correctionNote);
  if (!outcome.ok) throw new CommandError(outcome.message, outcome.error === "correction_note_required" ? "correctionNote" : undefined);
  const before = structuredClone(episode);
  apply();
  Object.assign(episode, outcome.patch);
  episode.lastEditedBy = viewer.id;
  episode.updatedAt = new Date().toISOString();
  if (changed.length > 0) {
    snapshot(data, episode, viewer.id, correctionNote ?? `Edited: ${changed.join(", ")}`);
    if (before.status !== episode.status) {
      data.mcEditorialEvents.push({ id: randomId("evt"), episodeId: episode.id, actorId: viewer.id, action: "returned_to_draft", fromStatus: before.status, toStatus: episode.status, version: episode.version, note: "Edited after submission or approval; review required again.", createdAt: episode.updatedAt });
    }
  }
  if (outcome.isCorrection && correctionNote) {
    data.mcCorrections.push({ id: randomId("cor"), episodeId: episode.id, version: episode.version, summary: correctionNote.trim(), correctedBy: viewer.id, createdAt: episode.updatedAt });
  }
  appendAudit(data, { actor: actorOf(viewer), action: outcome.isCorrection ? "mc.episode.corrected" : action, entityType: "mc_episode", entityId: episode.id, before, after: episode, reason: correctionNote }, reqId);
}

export async function updateEpisode(viewer: Viewer, id: string, input: EpisodeInput, correctionNote: string | null): Promise<void> {
  const reqId = await requestId();
  await writeData(scope(asViewer(viewer), { ...editorLoad, media: where("t.kind = 'audio'") }), (data) => {
    const episode = data.mcEpisodes.find((e) => e.id === id);
    if (!episode) throw new CommandError("Episode not found.");
    checkOrdering(data, episode.seriesId, input.season, input.episodeNumber, id);
    if (input.accessOverride !== episode.accessOverride && !staffCan(viewer.roles, "chronicles:review")) {
      throw new CommandError("Only a reviewer can change free/premium overrides.", "accessOverride");
    }
    if (input.slug && input.slug !== episode.slug && data.mcEpisodes.some((e) => e.slug === input.slug && e.id !== id)) {
      throw new CommandError("That address is already used.", "slug");
    }
    const changed = changedFields(episode, input);
    commitEdit(data, viewer, episode, changed, correctionNote, () => {
      Object.assign(episode, { ...input, slug: input.slug || episode.slug, title: input.title.trim(), relatedEpisodeIds: input.relatedEpisodeIds.filter((r) => r !== id) });
    }, reqId, "mc.episode.updated");
  });
}

export async function attachSource(viewer: Viewer, id: string, input: SourceInput, correctionNote: string | null): Promise<void> {
  const reqId = await requestId();
  await writeData(scope(asViewer(viewer), { ...editorLoad, media: where("t.kind = 'audio'") }), (data) => {
    const episode = data.mcEpisodes.find((e) => e.id === id);
    if (!episode) throw new CommandError("Episode not found.");
    const parsed = parseAudioSource(input, { allowedHosts: data.settings.authorisedAudioHosts });
    if (!parsed.ok) throw new CommandError(parsed.message, "source");
    if (parsed.source.kind === "uploaded_audio") {
      const assetId = parsed.source.assetId;
      if (!data.media.some((m) => m.id === assetId && m.kind === "audio")) throw new CommandError("That uploaded audio file was not found.", "source");
    }
    const now = new Date().toISOString();
    const source: McEpisodeSource = {
      kind: parsed.source.kind,
      url: parsed.source.kind === "uploaded_audio" ? null : parsed.source.url,
      assetId: parsed.source.kind === "uploaded_audio" ? parsed.source.assetId : null,
      status: "active",
      statusNote: "",
      checkedAt: null,
      updatedAt: now,
    };
    commitEdit(data, viewer, episode, ["source"], correctionNote, () => {
      episode.source = source;
    }, reqId, "mc.episode.source_attached");
  });
}

export async function setSourceStatus(viewer: Viewer, id: string, status: McEpisodeSource["status"], note: string): Promise<void> {
  if (!staffCan(viewer.roles, "chronicles:edit")) throw new CommandError("Your role cannot change sources.");
  const reqId = await requestId();
  await writeData(scope(asViewer(viewer), { ...editorLoad, media: where("t.kind = 'audio'") }), (data) => {
    const episode = data.mcEpisodes.find((e) => e.id === id);
    if (!episode?.source) throw new CommandError("This episode has no source.");
    if (status !== "active" && note.trim().length < 3) throw new CommandError("Say why the source is unavailable; listeners will see it.", "note");
    const before = { ...episode.source };
    episode.source.status = status;
    episode.source.statusNote = note.trim();
    episode.source.checkedAt = new Date().toISOString();
    episode.updatedAt = episode.source.checkedAt;
    appendAudit(data, { actor: actorOf(viewer), action: "mc.episode.source_status", entityType: "mc_episode", entityId: id, before, after: episode.source }, reqId);
  });
}

export async function editorialAction(viewer: Viewer, id: string, action: EditorialAction): Promise<string> {
  const reqId = await requestId();
  return writeData(scope(asViewer(viewer), { ...editorLoad, users: where("t.id in (select profile_id from public.platform_roles)") }), (data) => {
    const episode = data.mcEpisodes.find((e) => e.id === id);
    if (!episode) throw new CommandError("Episode not found.");
    const result = transition(editorialOf(episode), action, editorialActor(viewer), new Date());
    if (!result.ok) throw new CommandError(result.message);
    const from = episode.status;
    const before = structuredClone(episode);
    Object.assign(episode, result.patch);
    episode.updatedAt = new Date().toISOString();
    const note = "note" in action ? action.note ?? "" : "reason" in action ? action.reason : "";
    data.mcEditorialEvents.push({ id: randomId("evt"), episodeId: id, actorId: viewer.id, action: result.event, fromStatus: from, toStatus: episode.status, version: episode.version, note, createdAt: episode.updatedAt });
    appendAudit(data, { actor: actorOf(viewer), action: `mc.episode.${result.event}`, entityType: "mc_episode", entityId: id, before: { status: before.status, version: before.version }, after: { status: episode.status, publishedAt: episode.publishedAt }, reason: note || null }, reqId);

    const notifyUser = (userId: string | null, kind: "episode_submitted" | "episode_decided", decision: string) => {
      const user = userId ? data.users.find((u) => u.id === userId) : null;
      if (user && user.id !== viewer.id) notify(data, user, kind, { title: episode.title, decision, note, link: `/admin/medical-chronicles/episodes/${id}` });
    };
    if (result.event === "changes_requested" || result.event === "approved") notifyUser(episode.submittedBy, "episode_decided", result.event.replace("_", " "));
    if (result.event === "published" || result.event === "scheduled") notifyUser(episode.submittedBy, "episode_decided", result.event);
    if (result.event === "submitted") {
      for (const reviewer of data.users.filter((u) => staffCan(u.roles, "chronicles:review"))) {
        if (reviewer.id !== viewer.id) notify(data, reviewer, "episode_submitted", { title: episode.title, link: `/admin/medical-chronicles/episodes/${id}` });
      }
    }
    return result.event;
  });
}

/** Records an explicit medical review. Separate from publishing on purpose. */
export async function recordMedicalReview(viewer: Viewer, id: string, note: string): Promise<void> {
  if (!staffCan(viewer.roles, "chronicles:review")) throw new CommandError("Only a medical reviewer can record a review.");
  if (note.trim().length < 5) throw new CommandError("Describe what was reviewed.", "note");
  const reqId = await requestId();
  await writeData(scope(asViewer(viewer), { ...editorLoad, media: where("t.kind = 'audio'") }), (data) => {
    const episode = data.mcEpisodes.find((e) => e.id === id);
    if (!episode) throw new CommandError("Episode not found.");
    if (episode.lastEditedBy === viewer.id) throw new CommandError("You cannot record a review of content you last edited.");
    episode.lastReviewedAt = new Date().toISOString();
    episode.lastReviewedBy = viewer.id;
    data.mcEditorialEvents.push({ id: randomId("evt"), episodeId: id, actorId: viewer.id, action: "medical_review_recorded", fromStatus: episode.status, toStatus: episode.status, version: episode.version, note: note.trim(), createdAt: episode.lastReviewedAt });
    appendAudit(data, { actor: actorOf(viewer), action: "mc.episode.medical_review", entityType: "mc_episode", entityId: id, after: { version: episode.version }, reason: note.trim() }, reqId);
  });
}
