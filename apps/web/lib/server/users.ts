/**
 * Account administration and self-service account changes.
 */
import { canChangeAccountStatus, canChangeRole, ROLE_CHANGE_MESSAGE, staffCan } from "@kito/auth";
import type { PlatformRole } from "@kito/types";
import type { Viewer } from "./auth.ts";
import { appendAudit } from "./audit.ts";
import { requestId } from "./request.ts";
import { CommandError } from "./chronicles.ts";
import { listenerEntitlementFor } from "./entitlements.ts";
import { notify } from "./notify.ts";
import { applyAuthBan, asViewer, readData, scope, where, writeData, type Load } from "./data.ts";
import type { DataShape, NotificationKind, UserRecord } from "./types.ts";

const actorOf = (viewer: Viewer) => ({ id: viewer.id, roles: viewer.roles });

/** Billing rows are loaded only for roles whose RLS allows reading them (otherwise the query would be refused). */
const staffBilling = (viewer: Viewer) => (staffCan(viewer.roles, "subscriptions:read") ? true : where("false"));

export type UserSummary = Pick<UserRecord, "id" | "email" | "displayName" | "status" | "roles" | "createdAt" | "emailVerifiedAt" | "deletionRequestedAt"> & { premium: boolean };

export async function searchUsers(viewer: Viewer, query: { q?: string; role?: string; status?: string; page?: number }) {
  if (!staffCan(viewer.roles, "users:read")) throw new CommandError("Your role cannot view users.");
  // Users are read by the platform (emails live in auth.users); subscriptions and
  // overrides by the staff member, so RLS decides whether premium status is visible.
  const data = await readData(scope(asViewer(viewer), { users: true, subscriptions: staffBilling(viewer), overrides: staffBilling(viewer) }));
  const needle = (query.q ?? "").trim().toLowerCase();
  const filtered = data.users.filter((u) => {
    if (needle && !u.email.includes(needle) && !u.displayName.toLowerCase().includes(needle) && u.id !== needle) return false;
    if (query.role === "staff" && u.roles.length === 0) return false;
    if (query.role && query.role !== "staff" && !u.roles.includes(query.role as PlatformRole)) return false;
    if (query.status && u.status !== query.status) return false;
    return true;
  });
  const pageSize = 25;
  const page = Math.max(1, query.page ?? 1);
  const rows: UserSummary[] = filtered
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice((page - 1) * pageSize, page * pageSize)
    .map((u) => ({ id: u.id, email: u.email, displayName: u.displayName, status: u.status, roles: u.roles, createdAt: u.createdAt, emailVerifiedAt: u.emailVerifiedAt, deletionRequestedAt: u.deletionRequestedAt, premium: listenerEntitlementFor(data, u.id).premium }));
  return { rows, total: filtered.length, page, pages: Math.max(1, Math.ceil(filtered.length / pageSize)) };
}

export async function userDetail(viewer: Viewer, userId: string) {
  if (!staffCan(viewer.roles, "users:read")) throw new CommandError("Your role cannot view users.");
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(userId)) return null;
  const byUser = staffCan(viewer.roles, "subscriptions:read") ? where("t.profile_id::text = $1", userId) : where("false");
  const load: Load = {
    users: true,
    subscriptions: byUser,
    overrides: byUser,
    transactions: staffCan(viewer.roles, "payments:read") ? where("t.profile_id::text = $1", userId) : where("false"),
    plans: true,
    audit: staffCan(viewer.roles, "audit:read") ? where("(t.entity_id::text = $1 or t.actor_profile_id::text = $1)", userId) : where("false"),
  };
  const data = await readData(scope(asViewer(viewer), load));
  const user = data.users.find((u) => u.id === userId);
  if (!user) return null;
  const canSeePayments = staffCan(viewer.roles, "payments:read");
  return {
    user: { ...user, passwordHash: "[not shown]" },
    entitlement: listenerEntitlementFor(data, user.id),
    subscriptions: data.subscriptions.filter((s) => s.userId === userId),
    transactions: canSeePayments ? data.transactions.filter((t) => t.userId === userId) : null,
    overrides: data.overrides.filter((o) => o.userId === userId),
    audit: data.audit.filter((a) => a.entityId === userId || a.actorId === userId).slice(-50).reverse(),
    sessions: data.sessions.filter((s) => s.userId === userId).length,
    plans: data.plans,
    superAdminCount: data.users.filter((u) => u.roles.includes("super_admin")).length,
  };
}

export async function changeRole(viewer: Viewer, targetId: string, role: PlatformRole, change: "grant" | "revoke", reason: string): Promise<void> {
  if (reason.trim().length < 5) throw new CommandError("Give a reason for the role change.", "reason");
  const reqId = await requestId();
  // All users: the super-admin count is part of the decision.
  await writeData(scope(asViewer(viewer), { users: true }), (data) => {
    // Re-read the actor's roles from the store: never trust roles cached in a session.
    const actor = data.users.find((u) => u.id === viewer.id);
    const target = data.users.find((u) => u.id === targetId);
    if (!actor || !target) throw new CommandError("User not found.");
    const decision = canChangeRole({ actorId: actor.id, actorRoles: actor.roles, targetId, role, change, superAdminCount: data.users.filter((u) => u.roles.includes("super_admin")).length });
    if (!decision.ok) throw new CommandError(ROLE_CHANGE_MESSAGE[decision.error]);
    const before = [...target.roles];
    target.roles = change === "grant" ? [...new Set([...target.roles, role])] : target.roles.filter((r) => r !== role);
    target.updatedAt = new Date().toISOString();
    notify(data, target, "security_event", { event: `Your Sonara staff role "${role}" was ${change === "grant" ? "granted" : "removed"}.` });
    appendAudit(data, { actor: { id: actor.id, roles: actor.roles }, action: `role.${change}`, entityType: "user", entityId: targetId, before: { roles: before }, after: { roles: target.roles }, reason: reason.trim() }, reqId);
  });
}

export async function setAccountStatus(viewer: Viewer, targetId: string, status: "active" | "suspended", reason: string): Promise<void> {
  if (reason.trim().length < 5) throw new CommandError("Give a reason.", "reason");
  const reqId = await requestId();
  await writeData(scope(asViewer(viewer), { users: where("t.id::text in ($1, $2)", viewer.id, targetId) }), (data) => {
    const actor = data.users.find((u) => u.id === viewer.id);
    const target = data.users.find((u) => u.id === targetId);
    if (!actor || !target) throw new CommandError("User not found.");
    if (!canChangeAccountStatus({ actorId: actor.id, actorRoles: actor.roles, targetId, targetRoles: target.roles })) {
      throw new CommandError("You cannot change this account's status. Staff accounts are managed by a super administrator, and nobody can suspend themselves.");
    }
    if (target.status === "deleted") throw new CommandError("Deleted accounts cannot be changed.");
    const before = { status: target.status };
    target.status = status;
    target.suspendedReason = status === "suspended" ? reason.trim() : null;
    target.updatedAt = new Date().toISOString();
    if (status === "suspended") data.sessions = data.sessions.filter((s) => s.userId !== targetId);
    appendAudit(data, { actor: { id: actor.id, roles: actor.roles }, action: `account.${status === "suspended" ? "suspended" : "reactivated"}`, entityType: "user", entityId: targetId, before, after: { status }, reason: reason.trim() }, reqId);
  });
  // Supabase: suspension also blocks sign-in and refresh at the auth provider.
  await applyAuthBan(targetId, status === "suspended");
}

/* ------------------------------------------------------------- self-service */

export async function updateOwnProfile(viewer: Viewer, input: { displayName: string; bio: string; phone: string; country: string; locale: string; complete?: boolean }): Promise<void> {
  const name = input.displayName.trim();
  if (name.length < 2 || name.length > 80) throw new CommandError("Enter a name between 2 and 80 characters.", "displayName");
  if (input.bio.length > 600) throw new CommandError("Keep your bio under 600 characters.", "bio");
  const phone = input.phone.trim();
  if (phone && !/^\+?[0-9 ]{9,16}$/.test(phone)) throw new CommandError("Enter a phone number like +256 7XX XXX XXX.", "phone");
  if (!/^[A-Z]{2}$/.test(input.country)) throw new CommandError("Choose a country.", "country");
  await writeData(scope(asViewer(viewer), { users: where("t.id = $1", viewer.id) }), (data) => {
    const user = data.users.find((u) => u.id === viewer.id);
    if (!user) throw new CommandError("Account not found.");
    Object.assign(user, { displayName: name, bio: input.bio.trim(), phone: phone ? phone.replace(/\s+/g, "") : null, country: input.country, locale: input.locale, updatedAt: new Date().toISOString() });
    if (input.complete) user.profileCompletedAt ??= new Date().toISOString();
  });
}

export async function updatePreferences(viewer: Viewer, input: { playbackSpeed: number; autoplayNext: boolean; dataSaver: boolean; marketing: boolean }): Promise<void> {
  if (![0.75, 1, 1.25, 1.5, 2].includes(input.playbackSpeed)) throw new CommandError("Unsupported speed.");
  await writeData(scope(asViewer(viewer), { users: where("t.id = $1", viewer.id) }), (data) => {
    const user = data.users.find((u) => u.id === viewer.id);
    if (!user) return;
    user.preferences = { playbackSpeed: input.playbackSpeed, autoplayNext: input.autoplayNext, dataSaver: input.dataSaver };
    user.marketingConsent = input.marketing;
    user.updatedAt = new Date().toISOString();
  });
}

export async function updateEmailPreferences(viewer: Viewer, prefs: Partial<Record<NotificationKind, boolean>>): Promise<void> {
  await writeData(scope(asViewer(viewer), { users: where("t.id = $1", viewer.id) }), (data) => {
    const user = data.users.find((u) => u.id === viewer.id);
    if (!user) return;
    user.emailPreferences = { ...user.emailPreferences, ...prefs };
  });
}

export async function markNotificationsRead(viewer: Viewer): Promise<void> {
  await writeData(scope(asViewer(viewer), { notifications: where("t.profile_id = $1 and t.read_at is null", viewer.id) }), (data) => {
    const now = new Date().toISOString();
    for (const n of data.notifications) if (n.userId === viewer.id && !n.readAt) n.readAt = now;
  });
}

/**
 * Account deletion is a request, not an instant wipe: payment records must be
 * kept for accounting and the request needs a cooling-off period. The account
 * is signed out and marked; a staff process completes erasure (see docs).
 */
export async function requestAccountDeletion(viewer: Viewer, confirmEmail: string): Promise<void> {
  const reqId = await requestId();
  const load: Load = { users: where("t.id = $1 or exists (select 1 from public.platform_roles r where r.profile_id = t.id and r.role = 'super_admin')", viewer.id) };
  await writeData(scope(asViewer(viewer), load), (data) => {
    const user = data.users.find((u) => u.id === viewer.id);
    if (!user) throw new CommandError("Account not found.");
    if (confirmEmail.trim().toLowerCase() !== user.email) throw new CommandError("Type your account email to confirm.", "confirmEmail");
    if (user.roles.includes("super_admin") && data.users.filter((u) => u.roles.includes("super_admin")).length <= 1) {
      throw new CommandError("The last super administrator cannot delete their account.");
    }
    user.deletionRequestedAt = new Date().toISOString();
    data.sessions = data.sessions.filter((s) => s.userId !== user.id);
    appendAudit(data, { actor: { id: user.id, roles: user.roles }, action: "account.deletion_requested", entityType: "user", entityId: user.id }, reqId);
  });
}

export async function viewerInbox(viewer: Viewer) {
  return viewerInboxFrom(await readData(scope(asViewer(viewer), { notifications: where("t.profile_id = $1", viewer.id) })), viewer);
}

export function viewerInboxFrom(data: Readonly<DataShape>, viewer: Viewer) {
  return data.notifications.filter((n) => n.userId === viewer.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 100);
}

export async function listeningHistory(viewer: Viewer) {
  return listeningHistoryFrom(
    await readData(scope(asViewer(viewer), { listening: where("t.profile_id = $1", viewer.id), mcEpisodes: where("t.id in (select episode_id from public.mc_listening_events where profile_id = $1)", viewer.id), mcSeries: true })),
    viewer,
  );
}

export function listeningHistoryFrom(data: Readonly<DataShape>, viewer: Viewer) {
  return data.listening
    .filter((l) => l.userId === viewer.id)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, 200)
    .map((l) => {
      const episode = data.mcEpisodes.find((e) => e.id === l.episodeId) ?? null;
      const series = episode ? data.mcSeries.find((s) => s.id === episode.seriesId) ?? null : null;
      return { entry: l, episode, series };
    });
}

export async function savedEpisodes(viewer: Viewer) {
  return savedEpisodesFrom(
    await readData(scope(asViewer(viewer), { saved: where("t.profile_id = $1", viewer.id), mcEpisodes: where("t.id in (select episode_id from public.mc_saved_episodes where profile_id = $1)", viewer.id), mcSeries: true })),
    viewer,
  );
}

export function savedEpisodesFrom(data: Readonly<DataShape>, viewer: Viewer) {
  return data.saved
    .filter((s) => s.userId === viewer.id)
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
    .map((s) => {
      const episode = data.mcEpisodes.find((e) => e.id === s.episodeId) ?? null;
      const series = episode ? data.mcSeries.find((x) => x.id === episode.seriesId) ?? null : null;
      return { saved: s, episode, series };
    });
}

export async function exportMyData(viewer: Viewer) {
  const own = where("t.profile_id = $1", viewer.id);
  return exportMyDataFrom(
    await readData(scope(asViewer(viewer), { users: where("t.id = $1", viewer.id), subscriptions: own, transactions: own, listening: own, saved: own, notifications: own })),
    viewer,
  );
}

export function exportMyDataFrom(data: Readonly<DataShape>, viewer: Viewer) {
  const user = data.users.find((u) => u.id === viewer.id);
  if (!user) return null;
  const { passwordHash: _omit, ...profile } = user;
  return {
    exportedAt: new Date().toISOString(),
    profile,
    subscriptions: data.subscriptions.filter((s) => s.userId === viewer.id),
    payments: data.transactions.filter((t) => t.userId === viewer.id).map(({ providerRef: _ref, ...t }) => t),
    listening: data.listening.filter((l) => l.userId === viewer.id),
    saved: data.saved.filter((s) => s.userId === viewer.id),
    notifications: data.notifications.filter((n) => n.userId === viewer.id),
  };
}
