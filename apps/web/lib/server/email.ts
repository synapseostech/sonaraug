/**
 * Email delivery for the Supabase backend. SERVER ONLY.
 *
 * Providers (SONARA_EMAIL_PROVIDER):
 *   smtp   — any SMTP relay (Resend, Postmark, SES, SendGrid, Mailgun …; locally,
 *            Supabase's Mailpit on 127.0.0.1:55425). Credentials are server-only env vars.
 *   log    — nothing is sent; each message is recorded as "logged" (staging without credentials).
 *   none   — nothing is sent; recorded as "suppressed".
 * The dev backend keeps its own on-disk outbox (notify.ts) and never calls this.
 *
 * Authentication emails (verification, password reset) are sent by Supabase Auth
 * itself with its own SMTP settings, so their links never pass through here.
 * As a second line of defence those kinds are never stored with a body (the
 * database also forbids it) and no message body is ever written to logs.
 *
 * Retries: 3 immediate attempts with backoff; a failure is recorded with
 * next_attempt_at so `retryFailedEmails()` (admin "Run billing jobs") can retry later.
 */
import type { OutboxEmail } from "./types.ts";

export type EmailProviderKind = "smtp" | "log" | "none";

export type SmtpSettings = { host: string; port: number; secure: boolean; user: string | null; pass: string | null; from: string; requireTls: boolean };

export type EmailConfig = { provider: "smtp"; smtp: SmtpSettings } | { provider: "log" | "none" };

export class EmailConfigError extends Error {}

/** Pure: reads only the object passed in (unit-tested). */
export function resolveEmailConfig(env: Record<string, string | undefined>): EmailConfig {
  const provider = (env.SONARA_EMAIL_PROVIDER ?? "").trim() || (env.SMTP_HOST ? "smtp" : "log");
  if (provider === "log" || provider === "none") return { provider };
  if (provider !== "smtp") throw new EmailConfigError(`SONARA_EMAIL_PROVIDER must be smtp, log or none (got "${provider}")`);
  const host = env.SMTP_HOST?.trim();
  const from = env.EMAIL_FROM?.trim();
  const port = Number(env.SMTP_PORT || 587);
  if (!host) throw new EmailConfigError("SMTP_HOST is required for the smtp provider");
  if (!from || !/<[^@\s]+@[^@\s]+>$|^[^@\s]+@[^@\s]+$/.test(from)) throw new EmailConfigError("EMAIL_FROM must be an address, e.g. Sonara <no-reply@example.org>");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new EmailConfigError("SMTP_PORT is invalid");
  const local = host === "127.0.0.1" || host === "localhost";
  const requireTls = env.SMTP_REQUIRE_TLS ? env.SMTP_REQUIRE_TLS === "true" : !local;
  if (env.NODE_ENV === "production" && local) throw new EmailConfigError("SMTP_HOST points at localhost in production");
  return {
    provider: "smtp",
    smtp: { host, port, secure: env.SMTP_SECURE === "true" || port === 465, user: env.SMTP_USER?.trim() || null, pass: env.SMTP_PASS || null, from, requireTls },
  };
}

/** Kinds whose content must never be stored (they would contain sign-in or reset links). */
export const SENSITIVE_KINDS = new Set(["email_verification", "password_reset"]);

export type Sender = (message: { to: string; subject: string; text: string }) => Promise<void>;

function smtpSender(smtp: SmtpSettings): Sender {
  let transport: { sendMail: (m: Record<string, unknown>) => Promise<unknown> } | null = null;
  return async ({ to, subject, text }) => {
    if (!transport) {
      const nodemailer = await import("nodemailer");
      transport = nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure,
        requireTLS: smtp.requireTls,
        auth: smtp.user ? { user: smtp.user, pass: smtp.pass ?? "" } : undefined,
        connectionTimeout: 10_000,
        socketTimeout: 15_000,
      });
    }
    await transport.sendMail({ from: smtp.from, to, subject, text });
  };
}

/** Sends with bounded retries. Returns the final status and a short, body-free error. */
export async function sendWithRetry(send: Sender, message: { to: string; subject: string; text: string }, attempts = 3, delays = [0, 400, 1600]): Promise<{ ok: boolean; attempts: number; error: string | null }> {
  let lastError: string | null = null;
  for (let i = 0; i < attempts; i += 1) {
    if (delays[i]) await new Promise((r) => setTimeout(r, delays[i]));
    try {
      await send(message);
      return { ok: true, attempts: i + 1, error: null };
    } catch (error) {
      // Only the error class and code are kept: SMTP errors can echo the message.
      const e = error as { code?: string; responseCode?: number; name?: string };
      lastError = [e.name ?? "Error", e.code, e.responseCode].filter(Boolean).join(" ").slice(0, 120);
    }
  }
  return { ok: false, attempts, error: lastError };
}

let cachedSender: { key: string; send: Sender } | null = null;

export async function deliverEmails(outbox: readonly OutboxEmail[], overrideSender?: Sender): Promise<void> {
  if (outbox.length === 0) return;
  const config = resolveEmailConfig(process.env);
  let send: Sender | null = overrideSender ?? null;
  if (!send && config.provider === "smtp") {
    const key = `${config.smtp.host}:${config.smtp.port}`;
    if (!cachedSender || cachedSender.key !== key) cachedSender = { key, send: smtpSender(config.smtp) };
    send = cachedSender.send;
  }
  const { withService } = await import("./sb/db.ts");
  for (const message of outbox) {
    let status: "sent" | "failed" | "logged" | "suppressed";
    let attempts = 0;
    let error: string | null = null;
    if (send) {
      const result = await sendWithRetry(send, { to: message.to, subject: message.subject, text: message.text });
      status = result.ok ? "sent" : "failed";
      attempts = result.attempts;
      error = result.error;
      if (!result.ok) console.error(`[email] delivery failed kind=${message.kind} error=${result.error}`);
    } else {
      status = config.provider === "none" ? "suppressed" : "logged";
    }
    const body = SENSITIVE_KINDS.has(message.kind) || status === "sent" ? null : message.text;
    await withService("email delivery log", (db) =>
      db.query(
        `insert into public.email_deliveries (to_email, kind, subject, provider, status, attempts, last_error, body, sent_at, next_attempt_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, case when $5 = 'sent' then now() end, case when $5 = 'failed' then now() + interval '15 minutes' end)`,
        [message.to, message.kind, message.subject, overrideSender ? "test" : config.provider, status, attempts, error, body],
      ),
    ).catch((e: Error) => console.error(`[email] could not record delivery: ${e.message}`));
  }
}

/** Retries failed, non-sensitive deliveries whose body was kept. Returns counts. */
export async function retryFailedEmails(): Promise<{ retried: number; sent: number }> {
  const config = resolveEmailConfig(process.env);
  if (config.provider !== "smtp") return { retried: 0, sent: 0 };
  const send = smtpSender(config.smtp);
  const { withService } = await import("./sb/db.ts");
  return withService("email retry", async (db) => {
    const { rows } = await db.query(
      "select id, to_email, subject, body, attempts from public.email_deliveries where status = 'failed' and body is not null and next_attempt_at <= now() and attempts < 8 order by created_at limit 50 for update skip locked",
    );
    let sent = 0;
    for (const r of rows) {
      const result = await sendWithRetry(send, { to: r.to_email, subject: r.subject, text: r.body }, 1, [0]);
      if (result.ok) sent += 1;
      await db.query(
        `update public.email_deliveries set status = $2, attempts = attempts + 1, last_error = $3, sent_at = case when $2 = 'sent' then now() end,
           body = case when $2 = 'sent' then null else body end, next_attempt_at = case when $2 = 'failed' then now() + (interval '15 minutes' * power(2, least(attempts, 6))) end
         where id = $1`,
        [r.id, result.ok ? "sent" : "failed", result.error],
      );
    }
    return { retried: rows.length, sent };
  });
}
