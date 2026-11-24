/**
 * Accounts and sessions — LOCAL DEVELOPMENT AUTH ADAPTER.
 *
 * Implements the real behaviour (scrypt password hashes, hashed session tokens
 * in HttpOnly cookies, single-use expiring verification and reset tokens,
 * lockout, session revocation) against the development store. The production
 * target is Supabase Auth (sb/auth.ts). Callers use the facade in auth.ts,
 * which selects this adapter only when the dev backend is active.
 * See docs/SONARA_ACCOUNT_AND_AUTH.md.
 */
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { isStaff } from "@kito/auth";
import { normaliseEmail, passwordProblem, type AuthResult, type Viewer } from "./auth-shared.ts";
import { appendAudit } from "./audit.ts";
import { requestId } from "./request.ts";
import { burnPasswordCheck, hashPassword, randomId, randomToken, sha256, verifyPassword } from "./crypto.ts";
import { notify } from "./notify.ts";
import { read, transact } from "./store.ts";
import type { DataShape, SessionRecord, UserRecord } from "./types.ts";

export const SESSION_COOKIE = "sonara_session";
const SESSION_DAYS = 30;
const TOUCH_EVERY_MS = 10 * 60_000;
const VERIFY_TTL_MS = 24 * 3_600_000;
const RESET_TTL_MS = 3_600_000;
const MAX_FAILED = 5;
const LOCK_MS = 15 * 60_000;

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;

/* ------------------------------------------------------------------ cookies */

async function setSessionCookie(token: string, expires: Date): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: (process.env.SONARA_APP_URL ?? "").startsWith("https://"),
    path: "/",
    expires,
  });
}

async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
}

function toViewer(user: UserRecord, session: SessionRecord): Viewer {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    roles: user.roles,
    emailVerified: Boolean(user.emailVerifiedAt),
    profileComplete: Boolean(user.profileCompletedAt),
    isStaff: isStaff(user.roles),
    sessionId: session.id,
  };
}

/** The signed-in user for this request, or null. Cached per request. */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token || token.length > 200) return null;
  const id = sha256(token);
  const data = await read();
  const session = data.sessions.find((s) => s.id === id);
  if (!session || Date.parse(session.expiresAt) <= Date.now()) return null;
  const user = data.users.find((u) => u.id === session.userId);
  if (!user || user.status !== "active") return null;
  if (Date.now() - Date.parse(session.lastSeenAt) > TOUCH_EVERY_MS) {
    void transact((draft) => {
      const s = draft.sessions.find((entry) => entry.id === id);
      if (s) s.lastSeenAt = new Date().toISOString();
    }).catch(() => undefined);
  }
  return toViewer(user, session);
});

async function userAgent(): Promise<string> {
  try {
    return ((await headers()).get("user-agent") ?? "unknown").slice(0, 200);
  } catch {
    return "unknown";
  }
}

async function startSession(data: DataShape, user: UserRecord): Promise<{ token: string; expires: Date }> {
  const token = randomToken();
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_DAYS * 86_400_000);
  data.sessions.push({ id: sha256(token), userId: user.id, createdAt: now.toISOString(), lastSeenAt: now.toISOString(), expiresAt: expires.toISOString(), userAgent: await userAgent() });
  // Housekeeping: drop expired sessions.
  data.sessions = data.sessions.filter((s) => Date.parse(s.expiresAt) > now.getTime());
  return { token, expires };
}

function issueToken(data: DataShape, userId: string, kind: "verify_email" | "reset_password", ttlMs: number): string {
  const token = randomToken();
  const now = Date.now();
  // Only the newest token of a kind is valid.
  for (const t of data.tokens) if (t.userId === userId && t.kind === kind && !t.usedAt) t.usedAt = new Date(now).toISOString();
  data.tokens.push({ hash: sha256(token), userId, kind, expiresAt: new Date(now + ttlMs).toISOString(), usedAt: null, createdAt: new Date(now).toISOString() });
  data.tokens = data.tokens.filter((t) => Date.parse(t.expiresAt) > now - 86_400_000);
  return token;
}

/* -------------------------------------------------------------- operations */

export async function registerUser(input: { email: string; password: string; displayName: string; acceptTerms: boolean; marketing: boolean }): Promise<AuthResult> {
  const email = normaliseEmail(input.email);
  if (!EMAIL.test(email)) return { ok: false, field: "email", message: "Enter a valid email address." };
  const displayName = input.displayName.trim();
  if (displayName.length < 2 || displayName.length > 80) return { ok: false, field: "displayName", message: "Enter a name between 2 and 80 characters." };
  const problem = passwordProblem(input.password, email);
  if (problem) return { ok: false, field: "password", message: problem };
  if (!input.acceptTerms) return { ok: false, field: "acceptTerms", message: "You need to accept the terms and privacy notice." };

  const passwordHash = await hashPassword(input.password);
  const reqId = await requestId();
  const outcome = await transact(async (data) => {
    if (data.users.some((u) => u.email === email)) return { exists: true as const };
    const now = new Date().toISOString();
    const user: UserRecord = {
      id: randomId("usr"),
      email,
      passwordHash,
      displayName,
      status: "active",
      emailVerifiedAt: null,
      roles: [],
      termsVersion: data.settings.termsVersion,
      privacyVersion: data.settings.privacyVersion,
      termsAcceptedAt: now,
      profileCompletedAt: null,
      bio: "",
      phone: null,
      country: "UG",
      locale: "en-UG",
      preferences: { playbackSpeed: 1, autoplayNext: true, dataSaver: true },
      emailPreferences: { episode_published: false, renewal_reminder: true },
      marketingConsent: input.marketing,
      failedLogins: 0,
      lockedUntil: null,
      deletionRequestedAt: null,
      suspendedReason: null,
      createdAt: now,
      updatedAt: now,
    };
    data.users.push(user);
    const token = issueToken(data, user.id, "verify_email", VERIFY_TTL_MS);
    notify(data, user, "welcome");
    notify(data, user, "email_verification", { path: `/auth/verify-email?token=${token}` }, { inApp: false });
    appendAudit(data, { actor: { id: user.id, roles: [] }, action: "account.registered", entityType: "user", entityId: user.id, after: { email, termsVersion: user.termsVersion } }, reqId);
    const session = await startSession(data, user);
    return { exists: false as const, session };
  });
  if (outcome.exists) {
    // Do not reveal which emails have accounts.
    return { ok: false, field: "email", message: "We could not create an account with those details. If you already have one, sign in or reset your password." };
  }
  await setSessionCookie(outcome.session.token, outcome.session.expires);
  return { ok: true };
}

const attempts = new Map<string, { count: number; first: number }>();
function throttled(key: string): boolean {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now - entry.first > LOCK_MS) {
    attempts.set(key, { count: 1, first: now });
    return false;
  }
  entry.count += 1;
  return entry.count > 20;
}

export async function loginUser(input: { email: string; password: string }): Promise<AuthResult> {
  const email = normaliseEmail(input.email);
  const generic = { ok: false as const, message: "Email or password is incorrect." };
  if (throttled(`login:${email}`)) return { ok: false, message: "Too many attempts. Wait 15 minutes and try again." };
  const data = await read();
  const user = data.users.find((u) => u.email === email);
  if (!user) {
    await burnPasswordCheck(input.password);
    return generic;
  }
  if (user.lockedUntil && Date.parse(user.lockedUntil) > Date.now()) {
    return { ok: false, message: "This account is temporarily locked after several failed attempts. Try again later or reset your password." };
  }
  const valid = await verifyPassword(input.password, user.passwordHash);
  const reqId = await requestId();
  if (!valid) {
    await transact((draft) => {
      const u = draft.users.find((entry) => entry.id === user.id);
      if (!u) return;
      u.failedLogins += 1;
      if (u.failedLogins >= MAX_FAILED) {
        u.lockedUntil = new Date(Date.now() + LOCK_MS).toISOString();
        u.failedLogins = 0;
        notify(draft, u, "security_event", { event: "Your account was locked for 15 minutes after repeated failed sign-in attempts." });
        appendAudit(draft, { actor: null, action: "account.locked", entityType: "user", entityId: u.id }, reqId);
      }
    });
    return generic;
  }
  if (user.status !== "active") return { ok: false, message: user.status === "suspended" ? "This account is suspended. Contact support." : generic.message };
  const session = await transact(async (draft) => {
    const u = draft.users.find((entry) => entry.id === user.id);
    if (!u) throw new Error("user vanished");
    u.failedLogins = 0;
    u.lockedUntil = null;
    appendAudit(draft, { actor: { id: u.id, roles: u.roles }, action: "session.created", entityType: "user", entityId: u.id }, reqId);
    return startSession(draft, u);
  });
  await setSessionCookie(session.token, session.expires);
  return { ok: true };
}

export async function logout(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    const id = sha256(token);
    await transact((data) => {
      data.sessions = data.sessions.filter((s) => s.id !== id);
    });
  }
  await clearSessionCookie();
}

export async function resendVerification(input: { userId?: string; email?: string }): Promise<void> {
  await transact((data) => {
    const user = data.users.find((u) => (input.userId ? u.id === input.userId : u.email === normaliseEmail(input.email ?? "")));
    if (!user || user.emailVerifiedAt) return;
    const token = issueToken(data, user.id, "verify_email", VERIFY_TTL_MS);
    notify(data, user, "email_verification", { path: `/auth/verify-email?token=${token}` }, { inApp: false });
  });
}

export async function verifyEmail(input: { token?: string; tokenHash?: string; type?: string }): Promise<AuthResult> {
  const token = input.token ?? "";
  if (!token) return { ok: false, message: "This verification link is incomplete." };
  const hash = sha256(token);
  const reqId = await requestId();
  return transact((data) => {
    const record = data.tokens.find((t) => t.hash === hash && t.kind === "verify_email");
    if (!record || record.usedAt || Date.parse(record.expiresAt) <= Date.now()) {
      return { ok: false as const, message: "This verification link is invalid or has expired. Request a new one from your account." };
    }
    const user = data.users.find((u) => u.id === record.userId);
    if (!user) return { ok: false as const, message: "Account not found." };
    record.usedAt = new Date().toISOString();
    user.emailVerifiedAt ??= new Date().toISOString();
    appendAudit(data, { actor: { id: user.id, roles: user.roles }, action: "account.email_verified", entityType: "user", entityId: user.id }, reqId);
    return { ok: true as const };
  });
}

/** Always succeeds from the caller's point of view, so it cannot be used to discover accounts. */
export async function requestPasswordReset(emailInput: string): Promise<void> {
  const email = normaliseEmail(emailInput);
  if (throttled(`reset:${email}`)) return;
  await transact((data) => {
    const user = data.users.find((u) => u.email === email && u.status === "active");
    if (!user) return;
    const token = issueToken(data, user.id, "reset_password", RESET_TTL_MS);
    notify(data, user, "password_reset", { path: `/auth/reset-password?token=${token}` }, { inApp: false });
  });
}

export async function resetPassword(input: { token?: string; tokenHash?: string }, password: string): Promise<AuthResult> {
  const hash = sha256(input.token ?? "");
  const data = await read();
  const record = data.tokens.find((t) => t.hash === hash && t.kind === "reset_password");
  if (!record || record.usedAt || Date.parse(record.expiresAt) <= Date.now()) return { ok: false, message: "This reset link is invalid or has expired. Request a new one." };
  const user = data.users.find((u) => u.id === record.userId);
  if (!user) return { ok: false, message: "Account not found." };
  const problem = passwordProblem(password, user.email);
  if (problem) return { ok: false, field: "password", message: problem };
  const passwordHash = await hashPassword(password);
  const reqId = await requestId();
  await transact((draft) => {
    const r = draft.tokens.find((t) => t.hash === hash);
    const u = draft.users.find((entry) => entry.id === user.id);
    if (!r || !u || r.usedAt) throw new Error("token already used");
    r.usedAt = new Date().toISOString();
    u.passwordHash = passwordHash;
    u.lockedUntil = null;
    u.failedLogins = 0;
    // A password reset signs out every device.
    draft.sessions = draft.sessions.filter((s) => s.userId !== u.id);
    notify(draft, u, "security_event", { event: "Your password was reset and all devices were signed out." });
    appendAudit(draft, { actor: { id: u.id, roles: u.roles }, action: "account.password_reset", entityType: "user", entityId: u.id }, reqId);
  });
  return { ok: true };
}

export async function changePassword(viewer: Viewer, current: string, next: string): Promise<AuthResult> {
  const data = await read();
  const user = data.users.find((u) => u.id === viewer.id);
  if (!user || !(await verifyPassword(current, user.passwordHash))) return { ok: false, field: "current", message: "Your current password is incorrect." };
  const problem = passwordProblem(next, user.email);
  if (problem) return { ok: false, field: "next", message: problem };
  const passwordHash = await hashPassword(next);
  const reqId = await requestId();
  await transact((draft) => {
    const u = draft.users.find((entry) => entry.id === viewer.id);
    if (!u) return;
    u.passwordHash = passwordHash;
    u.updatedAt = new Date().toISOString();
    draft.sessions = draft.sessions.filter((s) => s.userId !== u.id || s.id === viewer.sessionId);
    notify(draft, u, "security_event", { event: "Your password was changed. Other devices were signed out." });
    appendAudit(draft, { actor: { id: u.id, roles: u.roles }, action: "account.password_changed", entityType: "user", entityId: u.id }, reqId);
  });
  return { ok: true };
}

export async function revokeSession(viewer: Viewer, sessionId: string | "others"): Promise<void> {
  await transact((data) => {
    data.sessions = data.sessions.filter((s) => {
      if (s.userId !== viewer.id) return true;
      if (sessionId === "others") return s.id === viewer.sessionId;
      return s.id !== sessionId;
    });
  });
}

export async function listSessions(viewer: Viewer): Promise<SessionRecord[]> {
  const data = await read();
  return data.sessions.filter((s) => s.userId === viewer.id && Date.parse(s.expiresAt) > Date.now()).sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
}

export async function currentUserRecord(viewer: Viewer): Promise<UserRecord | null> {
  const data = await read();
  return data.users.find((u) => u.id === viewer.id) ?? null;
}
