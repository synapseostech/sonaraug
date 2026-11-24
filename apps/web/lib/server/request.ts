import { headers } from "next/headers";
import { randomId } from "./crypto.ts";

/** Correlation id for audit records: the caller's x-request-id when well-formed, else a new one. */
export async function requestId(): Promise<string> {
  try {
    const h = await headers();
    const supplied = h.get("x-request-id");
    if (supplied && /^[A-Za-z0-9._-]{6,80}$/.test(supplied)) return supplied;
  } catch {
    // Outside a request (scripts, tests).
  }
  return randomId("req");
}
