/**
 * Append-only administrative audit log.
 *
 * Every privileged change writes one record with actor, action, entity,
 * before/after, reason and a request reference. Records are hash-chained, so
 * editing or deleting a record in the store breaks verification (verifyAuditChain).
 * There is deliberately no update or delete function. In Postgres the same log
 * is public.audit_logs, which has an append-only trigger and no client write grant.
 */
import type { PlatformRole } from "@kito/types";
import { randomId, sha256 } from "./crypto.ts";
import type { AuditRecord, DataShape } from "./types.ts";

export type AuditInput = {
  actor: { id: string; roles: PlatformRole[] } | null;
  action: string;
  entityType: string;
  entityId: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
};

const SECRET_KEYS = /password|secret|token|hash|key|authorization/i;

/** Strips anything that looks like a credential before it reaches the log. */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value)) {
    out[key] = SECRET_KEYS.test(key) ? "[redacted]" : redact(inner, depth + 1);
  }
  return out;
}

function digest(prevHash: string, record: Omit<AuditRecord, "hash" | "prevHash">): string {
  return sha256(prevHash + JSON.stringify(record));
}

/** Call inside `transact()` with the draft data. */
export function appendAudit(data: DataShape, input: AuditInput, reqId: string): AuditRecord {
  const last = data.audit[data.audit.length - 1];
  const prevHash = last?.hash ?? "genesis";
  const base = {
    id: randomId("aud"),
    seq: (last?.seq ?? 0) + 1,
    actorId: input.actor?.id ?? null,
    actorRoles: input.actor?.roles ?? [],
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    before: redact(input.before ?? null),
    after: redact(input.after ?? null),
    reason: input.reason ?? null,
    requestId: reqId,
    occurredAt: new Date().toISOString(),
  };
  const record: AuditRecord = { ...base, prevHash, hash: digest(prevHash, base) };
  data.audit.push(record);
  return record;
}

export function verifyAuditChain(records: readonly AuditRecord[]): { ok: true } | { ok: false; brokenAtSeq: number } {
  let prev = "genesis";
  for (const record of records) {
    const { hash, prevHash, ...base } = record;
    if (prevHash !== prev || digest(prevHash, base) !== hash) return { ok: false, brokenAtSeq: record.seq };
    prev = hash;
  }
  return { ok: true };
}
