/**
 * Per-request security headers (F-15 / N-7).
 *
 * A nonce is generated for every document request and put on both the request
 * and the response, which is how Next.js stamps its own scripts with it (see
 * the Next.js Content-Security-Policy guide). The policy itself is built by the
 * pure module `lib/security-headers.ts` so it can be tested without a server.
 *
 * Media origins come from the verified stream registry: a host can only become
 * playable by being added there (with its rights record), not by a component
 * hard-coding a URL. Third-party frames stay forbidden — NotebookLM links open
 * in a new tab. The Supabase project origin is added only when configured, and
 * only over https, because the browser client talks to it directly.
 */
import { NextResponse, type NextRequest } from "next/server";
import { STREAM_REGISTRY } from "./lib/data/streams.ts";
import { isHttpsRequest, mediaOriginsFrom, securityHeaders } from "./lib/security-headers.ts";

const STREAM_URLS = STREAM_REGISTRY.flatMap((station) => station.endpoints.map((endpoint) => endpoint.url));

function nonce(): string {
  return btoa(crypto.randomUUID());
}

export function middleware(request: NextRequest) {
  const requestNonce = nonce();
  const https = isHttpsRequest(request.nextUrl.protocol, request.headers.get("x-forwarded-proto"));
  const origins = mediaOriginsFrom([...STREAM_URLS, process.env.NEXT_PUBLIC_SUPABASE_URL]);
  const headers = securityHeaders({ nonce: requestNonce, production: process.env.NODE_ENV === "production", https, mediaOrigins: origins });
  const csp = headers.find(([name]) => name === "Content-Security-Policy")?.[1] ?? "";

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", requestNonce);
  // Next reads the nonce from the request-side CSP; the response carries the
  // same value for the browser to enforce.
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  for (const [name, value] of headers) response.headers.set(name, value);
  return response;
}

export const config = {
  runtime: "nodejs",
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
