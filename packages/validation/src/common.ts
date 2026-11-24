import { z } from "zod";

/** Reserved URL schemes we will never fetch or probe. */
const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
  "169.254.169.254",
]);

/** Parses a dotted-quad IPv4 literal into four octets, or null. */
function parseIpv4(host: string): [number, number, number, number] | null {
  const match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return null;
  const octets = match.slice(1, 5).map(Number) as [number, number, number, number];
  return octets.every((octet) => octet <= 255) ? octets : null;
}

/** IPv4 ranges that are not globally routable (RFC 6890 special-purpose registry). */
function isReservedIpv4([a, b, c]: readonly [number, number, number, number]): boolean {
  if (a === 0 || a === 10 || a === 127) return true; // this-network, private, loopback
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  if (a === 169 && b === 254) return true; // link-local, cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true; // IETF protocol, TEST-NET-1
  if (a === 192 && b === 88 && c === 99) return true; // 6to4 relay anycast
  if (a === 192 && b === 168) return true; // private
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a === 198 && b === 51 && c === 100) return true; // TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return true; // TEST-NET-3
  if (a >= 224) return true; // multicast, reserved, broadcast
  return false;
}

/** Expands an IPv6 literal (with optional embedded IPv4 tail) into eight 16-bit groups, or null. */
function parseIpv6(literal: string): number[] | null {
  let text = literal.split("%")[0] ?? ""; // drop any zone id
  let tail: number[] = [];
  const lastColon = text.lastIndexOf(":");
  const v4 = parseIpv4(text.slice(lastColon + 1));
  if (v4) {
    tail = [(v4[0] << 8) | v4[1], (v4[2] << 8) | v4[3]];
    text = text.slice(0, lastColon + 1) + "0";
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const toGroups = (part: string) => (part === "" ? [] : part.split(":"));
  const head = toGroups(halves[0] ?? "");
  const rest = halves.length === 2 ? toGroups(halves[1] ?? "") : [];
  const wanted = 8 - (tail.length > 0 ? 1 : 0); // the "0" placeholder stands in for the v4 tail
  const fill = halves.length === 2 ? wanted - head.length - rest.length : 0;
  if (fill < 0 || (halves.length === 1 && head.length !== wanted)) return null;
  const groups = [...head, ...Array<string>(fill).fill("0"), ...rest];
  if (!groups.every((group) => /^[0-9a-f]{1,4}$/.test(group))) return null;
  const numbers = groups.map((group) => parseInt(group, 16));
  if (tail.length > 0) numbers.splice(numbers.length - 1, 1, ...tail);
  return numbers.length === 8 ? numbers : null;
}

function isReservedIpv6(g: readonly number[]): boolean {
  const [g0 = 0, g1 = 0, g2 = 0, g3 = 0, g4 = 0, g5 = 0, g6 = 0, g7 = 0] = g;
  const embeddedV4 = (): [number, number, number, number] => [g6 >> 8, g6 & 0xff, g7 >> 8, g7 & 0xff];
  // ::/96 covers ::, ::1 and deprecated IPv4-compatible addresses (::a.b.c.d).
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) return true;
  // IPv4-mapped ::ffff:a.b.c.d (URL parsers normalise these to hex, e.g. ::ffff:7f00:1).
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0xffff) return isReservedIpv4(embeddedV4());
  // NAT64 (64:ff9b::/96 and 64:ff9b:1::/48) can translate to any internal IPv4 address.
  if (g0 === 0x64 && g1 === 0xff9b) return true;
  if ((g0 & 0xfe00) === 0xfc00) return true; // unique local fc00::/7
  if ((g0 & 0xffc0) === 0xfe80 || (g0 & 0xffc0) === 0xfec0) return true; // link-local, site-local
  if ((g0 & 0xff00) === 0xff00) return true; // multicast
  if (g0 === 0x2001 && g1 === 0x0db8) return true; // documentation
  if (g0 === 0x2001 && g1 === 0) return true; // Teredo tunnels embed arbitrary IPv4
  if (g0 === 0x2002) return true; // 6to4 embeds arbitrary IPv4
  return false;
}

/**
 * True for an IP literal (v4 or v6, optionally bracketed) that is not globally
 * routable. Also the check a server-side fetcher must apply to every address
 * a hostname RESOLVES to, before connecting and after every redirect, because
 * a public-looking name (e.g. 127.0.0.1.nip.io) can resolve to an internal IP.
 * Returns false for anything that is not an IP literal.
 */
export function isReservedIpAddress(address: string): boolean {
  const host = address.trim().toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
  const v4 = parseIpv4(host);
  if (v4) return isReservedIpv4(v4);
  if (host.includes(":")) {
    const v6 = parseIpv6(host);
    return v6 === null ? true : isReservedIpv6(v6); // unparseable v6 literal: refuse
  }
  return false;
}

/**
 * True for hosts that must never be reachable by a server-side probe (SSRF guard).
 *
 * This is a SYNTACTIC check on the host as written. It cannot detect a public
 * name that resolves to a private address, so it is necessary but not
 * sufficient: the fetcher must also resolve the name, check every resulting
 * address with `isReservedIpAddress`, pin the connection to that address, and
 * refuse redirects to reserved hosts.
 */
export function isPrivateOrReservedHost(hostname: string): boolean {
  let host = hostname.trim().toLowerCase();
  if (host.length === 0) return true;
  // Canonicalise legacy numeric forms (2130706433, 0x7f.1, 127.1) exactly as a URL parser would.
  if (!host.includes(":")) {
    try {
      host = new URL(`http://${host}/`).hostname;
    } catch {
      return true; // not a valid host at all
    }
  }
  host = host.replace(/\.$/, "");
  if (BLOCKED_HOSTNAMES.has(host)) return true;
  if (host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) return true;
  return isReservedIpAddress(host);
}

export const uuidSchema = z.string().uuid("must be a valid identifier");

export const slugSchema = z
  .string()
  .min(3, "must be at least 3 characters")
  .max(40, "must be at most 40 characters")
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])$/, "use lowercase letters, numbers and single hyphens");

export const handleSchema = z
  .string()
  .min(3)
  .max(30)
  .regex(/^[a-z0-9_]+$/, "use lowercase letters, numbers and underscores");

export const displayNameSchema = z.string().trim().min(1, "is required").max(80, "is too long");

export const descriptionSchema = z.string().trim().max(5_000, "is too long").optional();

/**
 * Ugandan mobile numbers, normalised to E.164 (+2567XXXXXXXX).
 * Accepts 07XXXXXXXX, 2567XXXXXXXX and +2567XXXXXXXX.
 */
export const ugandaPhoneSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s()-]/g, ""))
  .refine((value) => /^(?:\+?256|0)7\d{8}$/.test(value), "must be a Ugandan mobile number")
  .transform((value) => `+256${value.replace(/^\+?256/, "").replace(/^0/, "")}`);

export type UrlPolicy = {
  /** Allow plain http — needed for legacy Icecast origins in the field. */
  readonly allowHttp?: boolean;
};

export function publicUrlSchema(options: UrlPolicy = {}) {
  return z
    .string()
    .trim()
    .max(2_048)
    .url("must be a valid URL")
    .superRefine((value, ctx) => {
      const url = new URL(value);
      const allowed = options.allowHttp === true ? ["http:", "https:"] : ["https:"];
      if (!allowed.includes(url.protocol)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `must use ${allowed.join(" or ")}` });
      }
      if (url.username !== "" || url.password !== "") {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "must not embed credentials" });
      }
      if (isPrivateOrReservedHost(url.hostname)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "must be a publicly reachable host" });
      }
    });
}

export const languageCodesSchema = z
  .array(z.string().regex(/^[a-z]{2,3}(?:-[A-Z]{2})?$/, "must be a language tag such as en, lg, sw"))
  .min(1, "select at least one language")
  .max(6);

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().max(512).optional(),
});
