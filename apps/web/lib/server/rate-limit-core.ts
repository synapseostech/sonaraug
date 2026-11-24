/**
 * Rate-limit primitives with no Next.js or database imports, so the accounting
 * logic can be tested directly (the Supabase path lives in `rate-limit.ts`).
 *
 * The dev backend uses this in-memory map. It is per process, so it is a speed
 * bump rather than a guarantee — N-6 stays open until the distributed limiter
 * (Postgres, already in 0160) is the only path, i.e. once Supabase is live.
 */

export type Bucket = { name: string; max: number; windowSeconds: number };

export const LIMITS = {
  loginPerAccount: { name: "login:account", max: 10, windowSeconds: 900 },
  loginPerIp: { name: "login:ip", max: 50, windowSeconds: 900 },
  registerPerIp: { name: "register:ip", max: 10, windowSeconds: 3600 },
  registerPerAccount: { name: "register:account", max: 3, windowSeconds: 3600 },
  resetPerAccount: { name: "reset:account", max: 3, windowSeconds: 3600 },
  resetPerIp: { name: "reset:ip", max: 20, windowSeconds: 3600 },
  resendPerAccount: { name: "resend:account", max: 3, windowSeconds: 3600 },
  checkoutPerUser: { name: "checkout:user", max: 10, windowSeconds: 600 },
  uploadPerUser: { name: "upload:user", max: 30, windowSeconds: 3600 },
  playbackPerIp: { name: "playback:ip", max: 240, windowSeconds: 60 },
} satisfies Record<string, Bucket>;

export type MemoryStore = Map<string, { start: number; hits: number }>;

/** Counts one hit. Returns false once the bucket is exhausted inside its window. */
export function memoryHit(store: MemoryStore, key: string, bucket: Bucket, now = Date.now()): boolean {
  const entry = store.get(key);
  if (!entry || now - entry.start >= bucket.windowSeconds * 1000) {
    store.set(key, { start: now, hits: 1 });
    return true;
  }
  entry.hits += 1;
  return entry.hits <= bucket.max;
}
