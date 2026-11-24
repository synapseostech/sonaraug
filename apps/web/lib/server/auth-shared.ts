/** Types and pure helpers shared by both authentication adapters and the facade. */
import type { PlatformRole } from "@kito/types";

export type Viewer = {
  id: string;
  email: string;
  displayName: string;
  roles: PlatformRole[];
  emailVerified: boolean;
  profileComplete: boolean;
  isStaff: boolean;
  sessionId: string;
};

export type AuthResult = { ok: true } | { ok: false; message: string; field?: string };

export const normaliseEmail = (email: string): string => email.trim().toLowerCase();
export const EMAIL_PATTERN = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;

const COMMON = new Set(["password", "password1", "password123", "1234567890", "qwertyuiop", "sonara123", "letmein123", "iloveyou1"]);

export function passwordProblem(password: string, email: string): string | null {
  if (password.length < 10) return "Use at least 10 characters.";
  if (password.length > 200) return "Use at most 200 characters.";
  if (COMMON.has(password.toLowerCase())) return "That password is too common.";
  if (password.toLowerCase() === normaliseEmail(email)) return "Your password cannot be your email address.";
  if (new Set(password).size < 5) return "Use a less repetitive password.";
  return null;
}

/** Only same-site relative paths are accepted as post-login destinations. */
export function safeNext(next: string | null | undefined, fallback = "/account"): string {
  if (!next || typeof next !== "string") return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\") || next.includes("\n")) return fallback;
  if (next.startsWith("/auth/")) return fallback;
  return next.slice(0, 500);
}

export type AuthCapabilities = {
  /** Who sends verification and reset emails. */
  authEmails: "dev_outbox" | "supabase";
  /** Supabase requires a confirmed email before sign-in; the dev adapter does not. */
  signInRequiresVerifiedEmail: boolean;
};
