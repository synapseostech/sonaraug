/**
 * Accounts and sessions — SUPABASE AUTH ADAPTER.
 *
 * Supabase Auth (GoTrue) owns credentials, sessions, email confirmation and
 * recovery. Sonara adds: its password policy, terms acceptance recorded by the
 * server, account status checks, audit, notifications and rate limits (in the
 * facade). Every request is authenticated with `auth.getUser()` — a call to the
 * Auth server that also rejects sessions revoked server-side — never with
 * `getSession()` alone (whose cookie contents are not verified).
 *
 * Roles never come from user metadata: they are rows in public.platform_roles,
 * changed only through audited RPCs. Signup metadata may only suggest a display
 * name, which the database trims and length-limits (0160 handle_new_user).
 */
import { cache } from "react";
import { isStaff } from "@kito/auth";
import type { PlatformRole } from "@kito/types";
import { EMAIL_PATTERN, normaliseEmail, passwordProblem, type AuthResult, type Viewer } from "../auth-shared.ts";
import { appUrl } from "../notify.ts";
import type { SessionRecord, UserRecord } from "../types.ts";
import { withService, withUser } from "./db.ts";
import { requestClient, statelessClient, verifiedTokenClaim } from "./supabase.ts";
import { asViewer, readData, scope, where } from "../data.ts";

const verifyUrl = () => `${appUrl()}/auth/verify-email`;
const resetUrl = () => `${appUrl()}/auth/reset-password`;

async function systemAudit(actorId: string | null, action: string, entityId: string | null): Promise<void> {
  await withService("auth audit", (db) =>
    db.query("insert into public.audit_logs (actor_profile_id, action, entity_type, entity_id) values ($1, $2, 'user', $3)", [actorId, action, entityId]),
  ).catch((e: Error) => console.error(`[auth] audit failed: ${e.message}`));
}

async function systemNotify(userId: string, kind: string, title: string, body: string, link: string | null): Promise<void> {
  await withService("auth notification", (db) =>
    db.query("insert into public.notifications (profile_id, kind, title, body, link) values ($1, $2, $3, $4, $5)", [userId, kind, title, body, link]),
  ).catch((e: Error) => console.error(`[auth] notification failed: ${e.message}`));
}

/* ------------------------------------------------------------------ viewer */

export const getViewer = cache(async (): Promise<Viewer | null> => {
  const sb = await requestClient();
  const { data, error } = await sb.auth.getUser();
  if (error || !data.user) return null;
  const user = data.user;
  // Only used to read the session id claim of a token the Auth server just accepted.
  const { data: sessionData } = await sb.auth.getSession();
  const sessionId = verifiedTokenClaim(sessionData.session?.access_token, "session_id") ?? "unknown";
  const profile = await withUser(user.id, { email: user.email, session_id: sessionId }, async (db) => {
    const { rows } = await db.query(
      `select p.display_name, p.status, p.profile_completed_at,
              coalesce((select array_agg(r.role::text order by r.role) from public.platform_roles r where r.profile_id = p.id), '{}') as roles
       from public.profiles p where p.id = auth.uid()`,
    );
    return rows[0] as { display_name: string; status: string; profile_completed_at: Date | null; roles: PlatformRole[] } | undefined;
  });
  if (!profile || profile.status !== "active") return null;
  return {
    id: user.id,
    email: normaliseEmail(user.email ?? ""),
    displayName: profile.display_name,
    roles: profile.roles,
    emailVerified: Boolean(user.email_confirmed_at),
    profileComplete: Boolean(profile.profile_completed_at),
    isStaff: isStaff(profile.roles),
    sessionId,
  };
});

/* -------------------------------------------------------------- operations */

const GENERIC_REGISTER = "We could not create an account with those details. If you already have one, sign in or reset your password.";

export async function registerUser(input: { email: string; password: string; displayName: string; acceptTerms: boolean; marketing: boolean }): Promise<AuthResult> {
  const email = normaliseEmail(input.email);
  if (!EMAIL_PATTERN.test(email)) return { ok: false, field: "email", message: "Enter a valid email address." };
  const displayName = input.displayName.trim();
  if (displayName.length < 2 || displayName.length > 80) return { ok: false, field: "displayName", message: "Enter a name between 2 and 80 characters." };
  const problem = passwordProblem(input.password, email);
  if (problem) return { ok: false, field: "password", message: problem };
  if (!input.acceptTerms) return { ok: false, field: "acceptTerms", message: "You need to accept the terms and privacy notice." };

  const sb = await requestClient();
  const { data, error } = await sb.auth.signUp({ email, password: input.password, options: { emailRedirectTo: verifyUrl(), data: { display_name: displayName } } });
  if (error) {
    if (/password/i.test(error.message)) return { ok: false, field: "password", message: "Choose a stronger password." };
    if (error.status === 429) return { ok: false, message: "Too many sign-ups from this network. Please try again later." };
    console.error(`[auth] signUp failed: ${error.status ?? ""} ${error.code ?? ""}`);
    return { ok: false, message: GENERIC_REGISTER };
  }
  const user = data.user;
  // With confirmations on, an existing address returns a user with no identities and sends no email.
  if (user && (user.identities?.length ?? 0) > 0) {
    await withService("record terms acceptance at signup", (db) =>
      db.query(
        `update public.profiles set
           terms_version = (select value #>> '{}' from public.platform_settings where key = 'policy.terms_version'),
           privacy_version = (select value #>> '{}' from public.platform_settings where key = 'policy.privacy_version'),
           terms_accepted_at = now(), marketing_consent = $2
         where id = $1`,
        [user.id, input.marketing],
      ),
    );
    await systemNotify(user.id, "welcome", "Welcome to Sonara", "Your account is ready.", "/account");
    await systemAudit(user.id, "account.registered", user.id);
  }
  return { ok: true };
}

export async function loginUser(input: { email: string; password: string }): Promise<AuthResult> {
  const email = normaliseEmail(input.email);
  const sb = await requestClient();
  const { data, error } = await sb.auth.signInWithPassword({ email, password: input.password });
  if (error || !data.user) {
    const code = (error as { code?: string } | null)?.code ?? "";
    if (code === "email_not_confirmed") return { ok: false, message: "Confirm your email address first. Use the link we sent, or request a new one on the verification page." };
    if (code === "user_banned") return { ok: false, message: "This account is suspended. Contact support." };
    if (error?.status === 429) return { ok: false, message: "Too many attempts. Wait a few minutes and try again." };
    return { ok: false, message: "Email or password is incorrect." };
  }
  const status = await withService("account status at sign-in", async (db) => {
    const { rows } = await db.query("select status from public.profiles where id = $1", [data.user.id]);
    return rows[0]?.status as string | undefined;
  });
  if (status !== "active") {
    await sb.auth.signOut({ scope: "local" });
    return { ok: false, message: status === "suspended" ? "This account is suspended. Contact support." : "Email or password is incorrect." };
  }
  await systemAudit(data.user.id, "session.created", data.user.id);
  return { ok: true };
}

export async function logout(): Promise<void> {
  const sb = await requestClient();
  await sb.auth.signOut({ scope: "local" });
}

export async function resendVerification(input: { userId?: string; email?: string }, viewerEmail?: string): Promise<void> {
  const email = normaliseEmail(viewerEmail ?? input.email ?? "");
  if (!EMAIL_PATTERN.test(email)) return;
  const sb = await requestClient();
  const { error } = await sb.auth.resend({ type: "signup", email, options: { emailRedirectTo: verifyUrl() } });
  if (error) console.error(`[auth] resend failed: ${error.status ?? ""} ${(error as { code?: string }).code ?? ""}`);
}

export async function verifyEmail(input: { token?: string; tokenHash?: string; type?: string }): Promise<AuthResult> {
  const tokenHash = input.tokenHash ?? "";
  if (!/^[A-Za-z0-9_-]{10,200}$/.test(tokenHash)) return { ok: false, message: "This verification link is incomplete." };
  const type = input.type === "email_change" ? "email_change" : "email";
  const sb = await requestClient();
  const { data, error } = await sb.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error || !data.user) return { ok: false, message: "This verification link is invalid or has expired. Request a new one." };
  await systemAudit(data.user.id, "account.email_verified", data.user.id);
  return { ok: true };
}

/** Always "succeeds" for the caller: Supabase does not reveal whether the account exists. */
export async function requestPasswordReset(emailInput: string): Promise<void> {
  const email = normaliseEmail(emailInput);
  if (!EMAIL_PATTERN.test(email)) return;
  const sb = statelessClient();
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: resetUrl() });
  if (error) console.error(`[auth] reset request failed: ${error.status ?? ""}`);
}

export async function resetPassword(input: { token?: string; tokenHash?: string }, password: string): Promise<AuthResult> {
  const tokenHash = input.tokenHash ?? "";
  if (!/^[A-Za-z0-9_-]{10,200}$/.test(tokenHash)) return { ok: false, message: "This reset link is invalid or has expired. Request a new one." };
  // Check the new password BEFORE consuming the single-use link.
  const early = passwordProblem(password, "");
  if (early) return { ok: false, field: "password", message: early };
  const sb = await requestClient();
  const { data, error } = await sb.auth.verifyOtp({ type: "recovery", token_hash: tokenHash });
  if (error || !data.user) return { ok: false, message: "This reset link is invalid or has expired. Request a new one." };
  const sameAsEmail = passwordProblem(password, data.user.email ?? "");
  if (sameAsEmail) {
    await sb.auth.signOut({ scope: "local" });
    return { ok: false, field: "password", message: `${sameAsEmail} Request a new link and try again.` };
  }
  const update = await sb.auth.updateUser({ password });
  if (update.error) {
    await sb.auth.signOut({ scope: "local" });
    return { ok: false, field: "password", message: "That password was not accepted. Request a new link and choose a different one." };
  }
  // A reset signs out every device, including the one used for the reset.
  await sb.auth.signOut({ scope: "global" });
  await systemNotify(data.user.id, "security_event", "Account security", "Your password was reset and all devices were signed out.", "/account/security");
  await systemAudit(data.user.id, "account.password_reset", data.user.id);
  return { ok: true };
}

export async function changePassword(viewer: Viewer, current: string, next: string): Promise<AuthResult> {
  const problem = passwordProblem(next, viewer.email);
  if (problem) return { ok: false, field: "next", message: problem };
  // Prove the current password on a separate, cookie-less client, then end that extra session.
  const probe = statelessClient();
  const check = await probe.auth.signInWithPassword({ email: viewer.email, password: current });
  if (check.error) return { ok: false, field: "current", message: "Your current password is incorrect." };
  await probe.auth.signOut({ scope: "local" });
  const sb = await requestClient();
  const { error } = await sb.auth.updateUser({ password: next });
  if (error) return { ok: false, field: "next", message: "That password was not accepted. Choose a different one." };
  await sb.auth.signOut({ scope: "others" });
  await systemNotify(viewer.id, "security_event", "Account security", "Your password was changed. Other devices were signed out.", "/account/security");
  await systemAudit(viewer.id, "account.password_changed", viewer.id);
  return { ok: true };
}

export async function revokeSession(viewer: Viewer, sessionId: string | "others"): Promise<void> {
  const sb = await requestClient();
  if (sessionId === "others") {
    await sb.auth.signOut({ scope: "others" });
    return;
  }
  if (sessionId === viewer.sessionId) {
    await sb.auth.signOut({ scope: "local" });
    return;
  }
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) return;
  await withUser(viewer.id, { email: viewer.email, session_id: viewer.sessionId }, (db) => db.query("select public.revoke_my_session($1)", [sessionId]));
}

export async function listSessions(viewer: Viewer): Promise<SessionRecord[]> {
  return withUser(viewer.id, { email: viewer.email, session_id: viewer.sessionId }, async (db) => {
    const { rows } = await db.query("select id, created_at, updated_at, user_agent from public.my_sessions()");
    return rows.map((r) => ({
      id: String(r.id),
      userId: viewer.id,
      createdAt: new Date(r.created_at).toISOString(),
      lastSeenAt: new Date(r.updated_at ?? r.created_at).toISOString(),
      expiresAt: "",
      userAgent: String(r.user_agent ?? "unknown"),
    }));
  });
}

export async function currentUserRecord(viewer: Viewer): Promise<UserRecord | null> {
  const data = await readData(scope(asViewer(viewer), { users: where("t.id = $1", viewer.id) }));
  return data.users[0] ?? null;
}
