/**
 * Authentication facade — the only auth module pages and actions import.
 *
 * Selects the adapter for the configured backend (backend-config.ts, fail-closed):
 *   dev       → auth-dev.ts   (local development adapter, JSON store)
 *   supabase  → sb/auth.ts    (Supabase Auth)
 * and applies the same rate limits to both before the adapter runs.
 */
import { redirect } from "next/navigation";
import { cache } from "react";
import { staffCan, type StaffPermission } from "@kito/auth";
import { backendKind } from "./backend-config.ts";
import * as dev from "./auth-dev.ts";
import * as sb from "./sb/auth.ts";
import { AccessError } from "./errors.ts";
import { allow, clientIp, LIMITS, TOO_MANY } from "./rate-limit.ts";
import { normaliseEmail, safeNext, type AuthCapabilities, type AuthResult, type Viewer } from "./auth-shared.ts";
import type { SessionRecord, UserRecord } from "./types.ts";

export { AccessError } from "./errors.ts";
export { normaliseEmail, passwordProblem, safeNext, type AuthCapabilities, type AuthResult, type Viewer } from "./auth-shared.ts";

const impl = () => (backendKind() === "supabase" ? sb : dev);

export function authCapabilities(): AuthCapabilities {
  return backendKind() === "supabase"
    ? { authEmails: "supabase", signInRequiresVerifiedEmail: true }
    : { authEmails: "dev_outbox", signInRequiresVerifiedEmail: false };
}

/** The signed-in user for this request, or null. Cached per request; roles re-read every request. */
export const getViewer = cache(async (): Promise<Viewer | null> => impl().getViewer());

/** Redirects to sign-in when nobody is signed in. */
export async function requireViewer(nextPath: string): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect(`/auth/login?next=${encodeURIComponent(safeNext(nextPath))}`);
  return viewer;
}

/** For server actions and route handlers: throws instead of redirecting. */
export async function assertStaff(permission: StaffPermission): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer || !staffCan(viewer.roles, permission)) throw new AccessError(permission);
  return viewer;
}

/**
 * For admin pages. Layouts do not re-run on client navigation, so every admin
 * page calls this itself: sign-in redirect for visitors, a denial page for
 * signed-in users without the permission.
 */
export async function requireStaff(permission: StaffPermission, path: string): Promise<Viewer> {
  const viewer = await requireViewer(path);
  if (!staffCan(viewer.roles, permission)) redirect(`/admin/denied?need=${encodeURIComponent(permission)}`);
  return viewer;
}

/* ---------------------------------------------------------- rate-limited operations */

export async function registerUser(input: { email: string; password: string; displayName: string; acceptTerms: boolean; marketing: boolean }): Promise<AuthResult> {
  const ip = await clientIp();
  if (!(await allow(LIMITS.registerPerIp, ip)) || !(await allow(LIMITS.registerPerAccount, normaliseEmail(input.email)))) return { ok: false, message: TOO_MANY };
  return impl().registerUser(input);
}

export async function loginUser(input: { email: string; password: string }): Promise<AuthResult> {
  const ip = await clientIp();
  if (!(await allow(LIMITS.loginPerIp, ip)) || !(await allow(LIMITS.loginPerAccount, normaliseEmail(input.email)))) return { ok: false, message: TOO_MANY };
  return impl().loginUser(input);
}

export const logout = (): Promise<void> => impl().logout();

export async function resendVerification(input: { userId?: string; email?: string }, viewerEmail?: string): Promise<void> {
  const subject = viewerEmail ?? input.email ?? input.userId ?? "";
  if (!(await allow(LIMITS.resendPerAccount, subject))) return;
  if (backendKind() === "supabase") return sb.resendVerification(input, viewerEmail);
  return dev.resendVerification(input);
}

export const verifyEmail = (input: { token?: string; tokenHash?: string; type?: string }): Promise<AuthResult> => impl().verifyEmail(input);

export async function requestPasswordReset(email: string): Promise<void> {
  const ip = await clientIp();
  // Silently drop over-limit requests: the response is identical either way, so this reveals nothing.
  if (!(await allow(LIMITS.resetPerIp, ip)) || !(await allow(LIMITS.resetPerAccount, normaliseEmail(email)))) return;
  return impl().requestPasswordReset(email);
}

export const resetPassword = (input: { token?: string; tokenHash?: string }, password: string): Promise<AuthResult> => impl().resetPassword(input, password);
export const changePassword = (viewer: Viewer, current: string, next: string): Promise<AuthResult> => impl().changePassword(viewer, current, next);
export const revokeSession = (viewer: Viewer, sessionId: string | "others"): Promise<void> => impl().revokeSession(viewer, sessionId);
export const listSessions = (viewer: Viewer): Promise<SessionRecord[]> => impl().listSessions(viewer);
export const currentUserRecord = (viewer: Viewer): Promise<UserRecord | null> => impl().currentUserRecord(viewer);
