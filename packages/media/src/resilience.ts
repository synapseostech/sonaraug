import type { RadioEndpoint } from "./types.ts";

/** Base delay before the first retry. Kept short: users abandon after ~3s. */
export const BASE_RETRY_DELAY_MS = 400;
export const MAX_RETRY_DELAY_MS = 8_000;

/** Attempts on one endpoint before moving to the next one. */
export const ATTEMPTS_PER_ENDPOINT = 2;

export function backoffDelayMs(attempt: number): number {
  const safeAttempt = Math.max(0, Math.min(attempt, 16));
  return Math.min(BASE_RETRY_DELAY_MS * 2 ** safeAttempt, MAX_RETRY_DELAY_MS);
}

/**
 * Choose the endpoint order for a listener.
 *
 * Data-saver connections get the lowest bitrate first; everyone else gets the
 * primary endpoint first, then the rest by descending bitrate so a fallback
 * still sounds reasonable. Endpoints without a bitrate are never dropped.
 */
export function orderEndpoints(
  endpoints: readonly RadioEndpoint[],
  options: { dataSaver?: boolean } = {},
): readonly RadioEndpoint[] {
  const rank = (e: RadioEndpoint): number => {
    if (options.dataSaver === true) return e.bitrateKbps ?? Number.POSITIVE_INFINITY;
    return -(e.bitrateKbps ?? 0);
  };
  return [...endpoints].sort((a, b) => {
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
    const diff = rank(a) - rank(b);
    return diff !== 0 ? diff : a.id.localeCompare(b.id);
  });
}

export type EndpointProgress = { endpointIndex: number; attempt: number; exhausted: boolean };

/**
 * Advance through the endpoint list. One endpoint gets ATTEMPTS_PER_ENDPOINT
 * tries before failover, which avoids hammering a dead origin while still
 * surviving a single transient network blip.
 */
export function advanceEndpoint(
  endpointIndex: number,
  attempt: number,
  endpointCount: number,
): EndpointProgress {
  if (endpointCount <= 0) return { endpointIndex: 0, attempt: 0, exhausted: true };
  const nextAttempt = attempt + 1;
  if (nextAttempt < ATTEMPTS_PER_ENDPOINT) {
    return { endpointIndex, attempt: nextAttempt, exhausted: false };
  }
  const nextIndex = endpointIndex + 1;
  if (nextIndex >= endpointCount) {
    return { endpointIndex, attempt: nextAttempt, exhausted: true };
  }
  return { endpointIndex: nextIndex, attempt: 0, exhausted: false };
}
