/**
 * Security headers for the Sonara web app (F-15 / N-7).
 *
 * Pure: no Next.js imports, no environment reads. `middleware.ts` builds the
 * context from the request and this module decides the values, so the policy can
 * be unit-tested without a server.
 *
 * Design notes
 * ------------
 * - Scripts use a per-request nonce plus `strict-dynamic`. Next.js reads the
 *   nonce from the request's Content-Security-Policy header and stamps it onto
 *   its own bootstrap scripts, so production needs neither `unsafe-inline` nor
 *   `unsafe-eval`. Development adds both because the dev overlay and React
 *   Refresh depend on them — that relaxation never reaches production.
 * - `style-src` keeps `unsafe-inline` because the app (and Next) uses inline
 *   `style` attributes, which nonces cannot cover. It is a style injection
 *   vector only, not a script execution one.
 * - External audio is allow-listed by *origin*, taken from the verified stream
 *   registry. A new unlicensed host cannot become playable by adding a URL to a
 *   component; it has to be added to the registry (which also carries the
 *   rights record). Third-party iframes are not allowed at all: NotebookLM
 *   share links open in a normal external tab.
 * - HSTS is only emitted for an HTTPS request. Sending it over plain HTTP would
 *   either be ignored or, on a misconfigured local host, poison the browser for
 *   that host.
 */

export type SecurityContext = {
  nonce: string;
  /** NODE_ENV === "production" */
  production: boolean;
  /** The request arrived over HTTPS (directly or via a trusted proxy). */
  https: boolean;
  /** Origins the player may load audio/HLS from. Must be scheme+host(+port). */
  mediaOrigins: readonly string[];
};

const SELF = "'self'";

/** Headers that do not depend on the request. Kept here so tests pin them. */
export const BASE_SECURITY_HEADERS: readonly (readonly [string, string])[] = Object.freeze([
  ["X-Content-Type-Options", "nosniff"],
  ["Referrer-Policy", "strict-origin-when-cross-origin"],
  ["X-Frame-Options", "DENY"],
  ["Cross-Origin-Opener-Policy", "same-origin"],
  ["Permissions-Policy", "camera=(), microphone=(self), geolocation=(), payment=(self)"],
]);

/** Two years, subdomains included. No `preload` — that is a separate owner decision. */
export const HSTS_VALUE = "max-age=63072000; includeSubDomains";

/** Normalises a URL to its origin, dropping anything that is not https. */
export function safeMediaOrigin(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function mediaOriginsFrom(urls: readonly (string | null | undefined)[]): string[] {
  const origins = new Set<string>();
  for (const url of urls) {
    if (!url) continue;
    const origin = safeMediaOrigin(url);
    if (origin) origins.add(origin);
  }
  return [...origins].sort();
}

export type CspOptions = Pick<SecurityContext, "nonce" | "production" | "mediaOrigins"> & {
  /** The request arrived over HTTPS (enables upgrade-insecure-requests). */
  https?: boolean;
  /** Development needs the HMR websocket and eval-based refresh. */
  dev?: boolean;
};

export function buildContentSecurityPolicy(options: CspOptions): string {
  const dev = options.dev ?? !options.production;
  const media = [...new Set(options.mediaOrigins.filter((origin) => origin.startsWith("https://")))];

  const scriptSrc = dev
    ? [SELF, `'nonce-${options.nonce}'`, "'unsafe-eval'", "'unsafe-inline'"]
    : [SELF, `'nonce-${options.nonce}'`, "'strict-dynamic'"];

  const connectSrc = [SELF, ...media];
  if (dev) connectSrc.push("ws:", "wss:");

  const directives: [string, string[]][] = [
    ["default-src", [SELF]],
    ["base-uri", [SELF]],
    ["object-src", ["'none'"]],
    ["frame-ancestors", ["'none'"]],
    ["frame-src", ["'none'"]],
    ["form-action", [SELF]],
    ["script-src", scriptSrc],
    // Inline style attributes (and Next's own style injection) need unsafe-inline.
    ["style-src", [SELF, "'unsafe-inline'"]],
    ["img-src", [SELF, "data:", "blob:"]],
    // Radio and podcast audio: our own /api/media plus the verified stream origins.
    ["media-src", [SELF, "blob:", ...media]],
    ["connect-src", connectSrc],
    ["font-src", [SELF, "data:"]],
    ["worker-src", [SELF, "blob:"]],
    ["manifest-src", [SELF]],
  ];

  const policy = directives.map(([name, values]) => `${name} ${values.join(" ")}`).join("; ");
  // Only meaningful on a real HTTPS deployment; over plain HTTP it would try to
  // promote our own http:// subresources to https:// and break the page.
  return options.https && options.production ? `${policy}; upgrade-insecure-requests` : policy;
}

/** Request/response headers for one request. */
export function securityHeaders(context: SecurityContext): (readonly [string, string])[] {
  const headers: (readonly [string, string])[] = [
    ...BASE_SECURITY_HEADERS,
    [
      "Content-Security-Policy",
      buildContentSecurityPolicy({ nonce: context.nonce, production: context.production, mediaOrigins: context.mediaOrigins, https: context.https }),
    ],
  ];
  if (context.https) headers.push(["Strict-Transport-Security", HSTS_VALUE]);
  return headers;
}

/** True when the request reached us over TLS, honouring a trusted proxy. */
export function isHttpsRequest(protocol: string, forwardedProto: string | null): boolean {
  if (protocol === "https:") return true;
  return forwardedProto?.split(",")[0]?.trim().toLowerCase() === "https";
}
