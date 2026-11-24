/**
 * Notifications: in-app inbox + email through a provider abstraction.
 *
 * Providers:
 *   dev_outbox — DEVELOPMENT ONLY. Emails are stored on the server and shown at
 *                /dev/outbox so links (verification, password reset) can be followed
 *                locally. Nothing leaves the machine.
 *   (production) — not implemented. A transactional provider (e.g. SMTP, Resend,
 *                Postmark, Amazon SES) must be chosen and configured; until then
 *                `emailDeliveryConfigured()` is false and the UI says so.
 *
 * Transactional and security messages ignore marketing preferences; optional
 * ones respect the user's choice.
 */
import { brand } from "@kito/config";
import { randomId } from "./crypto.ts";
import type { DataShape, NotificationKind, UserRecord } from "./types.ts";

export type EmailProviderName = "dev_outbox" | "none";

export function emailProvider(): EmailProviderName {
  const configured = process.env.SONARA_EMAIL_PROVIDER;
  if (configured === "none") return "none";
  if (process.env.NODE_ENV !== "production" || process.env.SONARA_ALLOW_DEV_BACKEND === "1") return "dev_outbox";
  return "none";
}

export const emailDeliveryConfigured = (): boolean => emailProvider() !== "none";

/** Always delivered regardless of preferences. */
const MANDATORY: ReadonlySet<NotificationKind> = new Set([
  "email_verification",
  "password_reset",
  "payment_receipt",
  "payment_failed",
  "subscription_cancelled",
  "subscription_confirmed",
  "security_event",
]);

export const NOTIFICATION_KIND_LABEL: Record<NotificationKind, string> = {
  welcome: "Welcome",
  email_verification: "Email verification",
  password_reset: "Password reset",
  subscription_confirmed: "Subscription confirmation",
  payment_receipt: "Payment receipt",
  payment_failed: "Payment failure",
  renewal_reminder: "Renewal reminders",
  subscription_cancelled: "Subscription cancellation",
  creator_application_received: "Creator application received",
  creator_application_decided: "Creator application decision",
  episode_submitted: "Episode submitted for review",
  episode_decided: "Episode review decision",
  episode_published: "New episodes published",
  security_event: "Account security alerts",
};

export const OPTIONAL_KINDS: NotificationKind[] = (Object.keys(NOTIFICATION_KIND_LABEL) as NotificationKind[]).filter((k) => !MANDATORY.has(k));

export function isMandatory(kind: NotificationKind): boolean {
  return MANDATORY.has(kind);
}

export function appUrl(): string {
  return (process.env.SONARA_APP_URL || "http://127.0.0.1:3100").replace(/\/$/, "");
}

type Message = { subject: string; text: string; title: string; body: string; link: string | null };

export function renderTemplate(kind: NotificationKind, vars: Record<string, string>): Message {
  const name = brand.name;
  const v = (key: string) => vars[key] ?? "";
  switch (kind) {
    case "welcome":
      return { title: `Welcome to ${name}`, body: "Your account is ready.", subject: `Welcome to ${name}`, text: `Hello ${v("displayName")},\n\nYour ${name} account is ready.`, link: "/account" };
    case "email_verification":
      return { title: "Verify your email", body: "Confirm your address to subscribe and apply as a creator.", subject: `Verify your ${name} email`, text: `Confirm your email address:\n${appUrl()}${v("path")}\n\nThis link expires in 24 hours. If you did not create an account, ignore this email.`, link: null };
    case "password_reset":
      return { title: "Password reset requested", body: "Follow the link in the email to choose a new password.", subject: `Reset your ${name} password`, text: `Choose a new password:\n${appUrl()}${v("path")}\n\nThis link expires in 1 hour and works once. If you did not ask for this, you can ignore it.`, link: null };
    case "subscription_confirmed":
      return { title: "Subscription active", body: `${v("plan")} is active until ${v("until")}.`, subject: `Your ${name} subscription is active`, text: `${v("plan")} is active until ${v("until")}.`, link: "/account/subscriptions" };
    case "payment_receipt":
      return { title: "Payment received", body: `${v("amount")} for ${v("plan")} (ref ${v("ref")}).`, subject: `${name} receipt ${v("ref")}`, text: `We received ${v("amount")} for ${v("plan")}.\nReference: ${v("ref")}\nPayment method: ${v("method")}`, link: "/account/payment-history" };
    case "payment_failed":
      return { title: "Payment not completed", body: `Your payment for ${v("plan")} did not go through.`, subject: `${name}: payment not completed`, text: `Your payment for ${v("plan")} (ref ${v("ref")}) did not go through. No money was taken by ${name}. You can try again from your account.`, link: "/subscribe/listener" };
    case "renewal_reminder":
      return { title: "Renewal coming up", body: `${v("plan")} ends on ${v("until")}.`, subject: `${name}: your subscription ends ${v("until")}`, text: `${v("plan")} ends on ${v("until")}. Renew from ${appUrl()}/subscribe/renewal to keep premium access.`, link: "/subscribe/renewal" };
    case "subscription_cancelled":
      return { title: "Subscription cancelled", body: `Access continues until ${v("until")}.`, subject: `${name}: subscription cancelled`, text: `Your subscription will not renew. You keep access until ${v("until")}.`, link: "/account/subscriptions" };
    case "creator_application_received":
      return { title: "Creator application received", body: "We will review it and let you know.", subject: `${name}: creator application received`, text: "Thanks for applying. A reviewer will look at your application.", link: "/creator/application-status" };
    case "creator_application_decided":
      return { title: `Creator application ${v("decision")}`, body: v("reason"), subject: `${name}: creator application ${v("decision")}`, text: `Your creator application was ${v("decision")}.\n${v("reason")}`, link: "/creator/application-status" };
    case "episode_submitted":
      return { title: "Episode submitted for review", body: v("title"), subject: `${name}: episode submitted`, text: `"${v("title")}" was submitted for review.`, link: v("link") || null };
    case "episode_decided":
      return { title: `Episode ${v("decision")}`, body: v("title"), subject: `${name}: episode ${v("decision")}`, text: `"${v("title")}" was ${v("decision")}.\n${v("note")}`, link: v("link") || null };
    case "episode_published":
      return { title: "New episode", body: v("title"), subject: `${name}: new episode`, text: `"${v("title")}" is now available.`, link: v("link") || null };
    case "security_event":
      return { title: "Account security", body: v("event"), subject: `${name} security notice`, text: `${v("event")}\n\nIf this was not you, reset your password now: ${appUrl()}/auth/forgot-password`, link: "/account/security" };
  }
}

/** Call inside `transact()`. Records an in-app notification and (if allowed) an email. */
export function notify(data: DataShape, user: UserRecord, kind: NotificationKind, vars: Record<string, string> = {}, options: { inApp?: boolean } = {}): void {
  const message = renderTemplate(kind, { displayName: user.displayName, ...vars });
  const now = new Date().toISOString();
  if (options.inApp !== false) {
    data.notifications.push({ id: randomId("ntf"), userId: user.id, kind, title: message.title, body: message.body, link: message.link, readAt: null, createdAt: now });
  }
  const wantsEmail = isMandatory(kind) || user.emailPreferences[kind] !== false;
  if (!wantsEmail || emailProvider() === "none") return;
  data.outbox.push({ id: randomId("eml"), to: user.email, kind, subject: message.subject, text: message.text, createdAt: now, provider: "dev_outbox" });
  if (data.outbox.length > 500) data.outbox.splice(0, data.outbox.length - 500);
}
