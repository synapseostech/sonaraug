/**
 * Supabase Auth clients. SERVER ONLY.
 *
 * - requestClient(): per-request client bound to the Next.js cookie store
 *   (@supabase/ssr getAll/setAll). Cookies are HttpOnly: Sonara never uses a
 *   browser Supabase client, so page scripts never need (or get) the tokens.
 * - statelessClient(): no cookies; used to check a password without touching
 *   the caller's session.
 * - adminClient(): secret key; auth administration only (ban/unban). Never sent
 *   to a browser, never used for data reads (data goes through sb/db.ts).
 */
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { backendConfig, BackendConfigError, type SupabaseSettings } from "../backend-config.ts";

function settings(): SupabaseSettings {
  const config = backendConfig();
  if (config.kind !== "supabase") throw new BackendConfigError(["Supabase Auth requested while the dev backend is active"]);
  return config.supabase;
}

export const secureCookies = () => (process.env.SONARA_APP_URL ?? "").startsWith("https://");

export async function requestClient(): Promise<SupabaseClient> {
  const s = settings();
  const jar = await cookies();
  return createServerClient(s.url, s.publishableKey, {
    cookieOptions: { httpOnly: true, secure: secureCookies(), sameSite: "lax", path: "/" },
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) jar.set(name, value, { ...options, httpOnly: true, secure: secureCookies(), sameSite: "lax" });
        } catch {
          // Server Components cannot set cookies; the middleware refreshes the session instead.
        }
      },
    },
  });
}

export function statelessClient(): SupabaseClient {
  const s = settings();
  return createClient(s.url, s.publishableKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

let admin: SupabaseClient | null = null;
export function adminClient(): SupabaseClient {
  if (admin) return admin;
  const s = settings();
  admin = createClient(s.url, s.secretKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  return admin;
}

/** Reads a claim from a JWT payload that GoTrue has ALREADY verified (getUser). Never used for authorisation on its own. */
export function verifiedTokenClaim(accessToken: string | undefined, claim: string): string | null {
  if (!accessToken) return null;
  const part = accessToken.split(".")[1];
  if (!part) return null;
  try {
    const payload = JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as Record<string, unknown>;
    const value = payload[claim];
    return typeof value === "string" ? value : null;
  } catch {
    return null;
  }
}
