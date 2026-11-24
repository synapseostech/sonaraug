/**
 * Rate limiting for authentication and other sensitive endpoints (N-6).
 *
 *   dev backend:      in-memory, per process (adequate for one local server).
 *   supabase backend: app_private.rate_limit_hit() in Postgres, shared by every
 *                     app instance. Keys are SHA-256 hashed: no emails or IPs stored.
 *
 * Supabase Auth applies its own per-IP limits on sign-in, sign-up and email
 * sending as well; these are additional, per-account and per-IP, and cover
 * Sonara's own endpoints (checkout, uploads, playback).
 */
import { headers } from "next/headers";
import { backendKind } from "./backend-config.ts";
import { sha256 } from "./crypto.ts";
import { LIMITS, memoryHit, type Bucket, type MemoryStore } from "./rate-limit-core.ts";

export { LIMITS, memoryHit };
export type { Bucket };

const memory: MemoryStore = new Map();

/** True when the request may proceed. Fails OPEN only if the limiter store itself is unreachable. */
export async function allow(bucket: Bucket, subject: string): Promise<boolean> {
  const key = sha256(`${bucket.name}:${subject.toLowerCase()}`);
  if (backendKind() !== "supabase") return memoryHit(memory, key, bucket);
  try {
    const { withService } = await import("./sb/db.ts");
    return await withService("rate limit", async (db) => {
      const { rows } = await db.query("select app_private.rate_limit_hit($1, $2, $3) as ok", [key, bucket.max, bucket.windowSeconds]);
      return Boolean(rows[0]?.ok);
    });
  } catch (error) {
    console.error(`[rate-limit] store unavailable: ${(error as Error).message}`);
    return true;
  }
}

/**
 * The client address as seen by the first trusted proxy. Behind Vercel/Cloudflare
 * the left-most X-Forwarded-For entry is the client; set SONARA_TRUST_PROXY=0 when
 * no proxy sets it (then everything is keyed to "direct").
 */
export async function clientIp(): Promise<string> {
  try {
    if (process.env.SONARA_TRUST_PROXY === "0") return "direct";
    const h = await headers();
    const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
    return forwarded || h.get("x-real-ip") || "direct";
  } catch {
    return "direct";
  }
}

export const TOO_MANY = "Too many attempts. Please wait a few minutes and try again.";
