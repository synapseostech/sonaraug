import { createHash, randomBytes, randomUUID, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (password: string, salt: Buffer, keylen: number, options: { N: number; r: number; p: number; maxmem: number }) => Promise<Buffer>;

/**
 * Record ids. The dev store uses readable prefixed ids; Postgres columns are
 * uuid, so the Supabase backend gets UUIDs. Decided per call from the environment
 * (no import of backend-config, which keeps this module usable from scripts).
 */
export const randomId = (prefix: string): string =>
  process.env.SONARA_BACKEND === "supabase" || (process.env.NODE_ENV === "production" && process.env.SONARA_BACKEND !== "dev")
    ? randomUUID()
    : `${prefix}_${randomBytes(12).toString("hex")}`;
export const randomToken = (): string => randomBytes(32).toString("base64url");
export const randomHex = (bytes = 16): string => randomBytes(bytes).toString("hex");
export const sha256 = (value: string | Buffer): string => createHash("sha256").update(value).digest("hex");

const N = 1 << 15;
const R = 8;
const P = 1;
const KEYLEN = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password.normalize("NFKC"), salt, KEYLEN, { N, r: R, p: P, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, saltText, keyText] = stored.split("$");
  if (scheme !== "scrypt" || !n || !r || !p || !saltText || !keyText) return false;
  const expected = Buffer.from(keyText, "base64url");
  const actual = await scrypt(password.normalize("NFKC"), Buffer.from(saltText, "base64url"), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: 64 * 1024 * 1024,
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** A real scrypt run against a throwaway hash, so unknown emails take as long as wrong passwords. */
let dummyHash: Promise<string> | null = null;
export async function burnPasswordCheck(password: string): Promise<void> {
  dummyHash ??= hashPassword("not-a-real-password-placeholder");
  await verifyPassword(password, await dummyHash);
}
