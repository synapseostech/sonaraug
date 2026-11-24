/**
 * Central entitlement engine.
 *
 * Answers "may this user do X right now?" from subscriptions, administrator
 * overrides and creator approval. It is pure; the server loads the records and
 * calls it on every protected request. Nothing in the browser decides access.
 *
 * Separation rule: listener and creator entitlements are computed from records
 * of their own audience only. A creator plan never unlocks premium listening and
 * a listener plan never grants publishing.
 *
 * Precedence: an active "revoke" override beats everything; an active "grant"
 * override beats a missing subscription; otherwise the best subscription wins.
 */
import type { CreatorLimits, Plan, PlanAudience } from "./plans.ts";
import { effectiveState, type EffectiveState, type Subscription } from "./subscriptions.ts";

export type EntitlementOverride = {
  readonly id: string;
  readonly userId: string;
  readonly audience: PlanAudience;
  readonly effect: "grant" | "revoke";
  /** For creator grants: which plan's limits apply. */
  readonly planId: string | null;
  readonly validFrom: string;
  readonly validUntil: string | null;
  readonly reason: string;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly revokedAt: string | null;
  readonly revokedBy: string | null;
  /** Why an override was revoked (stored by the audited revoke RPC). */
  readonly revokeReason?: string | null;
};

export function overrideIsActive(o: EntitlementOverride, now: Date): boolean {
  if (o.revokedAt) return false;
  const t = now.getTime();
  if (Date.parse(o.validFrom) > t) return false;
  return o.validUntil === null || Date.parse(o.validUntil) > t;
}

export type EntitlementSource = "subscription" | "override" | "none" | "revoked";

export type ListenerEntitlement = {
  readonly premium: boolean;
  readonly source: EntitlementSource;
  readonly state: EffectiveState | null;
  readonly accessUntil: string | null;
  readonly subscriptionId: string | null;
  readonly planId: string | null;
};

type Records = {
  readonly subscriptions: readonly Subscription[];
  readonly overrides: readonly EntitlementOverride[];
};

const RANK: Record<EffectiveState, number> = { active: 5, cancelling: 4, trial: 3, grace: 2, pending: 1, expired: 0 };

function bestSubscription(subs: readonly Subscription[], now: Date, graceDays: number) {
  let best: { sub: Subscription; eff: ReturnType<typeof effectiveState> } | null = null;
  for (const sub of subs) {
    const eff = effectiveState(sub, now, graceDays);
    if (!best || RANK[eff.state] > RANK[best.eff.state] || (RANK[eff.state] === RANK[best.eff.state] && (eff.accessUntil ?? "") > (best.eff.accessUntil ?? ""))) {
      best = { sub, eff };
    }
  }
  return best;
}

export function listenerEntitlement(userId: string, records: Records, now: Date, graceDays: number): ListenerEntitlement {
  const overrides = records.overrides.filter((o) => o.userId === userId && o.audience === "listener" && overrideIsActive(o, now));
  const subs = records.subscriptions.filter((s) => s.userId === userId && s.audience === "listener");
  const best = bestSubscription(subs, now, graceDays);

  if (overrides.some((o) => o.effect === "revoke")) {
    return { premium: false, source: "revoked", state: best?.eff.state ?? null, accessUntil: null, subscriptionId: best?.sub.id ?? null, planId: null };
  }
  if (best?.eff.grantsAccess) {
    return { premium: true, source: "subscription", state: best.eff.state, accessUntil: best.eff.accessUntil, subscriptionId: best.sub.id, planId: best.sub.planId };
  }
  const grant = overrides.find((o) => o.effect === "grant");
  if (grant) {
    return { premium: true, source: "override", state: best?.eff.state ?? null, accessUntil: grant.validUntil, subscriptionId: best?.sub.id ?? null, planId: null };
  }
  return { premium: false, source: "none", state: best?.eff.state ?? null, accessUntil: null, subscriptionId: best?.sub.id ?? null, planId: best?.sub.planId ?? null };
}

export type CreatorEntitlement = {
  readonly approvedCreator: boolean;
  readonly planActive: boolean;
  readonly canPublish: boolean;
  readonly limits: CreatorLimits | null;
  readonly planId: string | null;
  readonly source: EntitlementSource;
  readonly reason: "ok" | "not_approved" | "no_plan" | "plan_excludes_publishing" | "revoked";
};

/**
 * Publishing needs BOTH an approved creator application AND an active creator
 * plan that includes publishing. Paying never approves; approval never pays.
 */
export function creatorEntitlement(
  userId: string,
  records: Records & { readonly plans: readonly Plan[] },
  approvedCreator: boolean,
  now: Date,
  graceDays: number,
): CreatorEntitlement {
  const overrides = records.overrides.filter((o) => o.userId === userId && o.audience === "creator" && overrideIsActive(o, now));
  const subs = records.subscriptions.filter((s) => s.userId === userId && s.audience === "creator");
  const best = bestSubscription(subs, now, graceDays);
  const planFor = (id: string | null | undefined) => records.plans.find((p) => p.id === id && p.audience === "creator") ?? null;

  if (overrides.some((o) => o.effect === "revoke")) {
    return { approvedCreator, planActive: false, canPublish: false, limits: null, planId: null, source: "revoked", reason: "revoked" };
  }
  let plan: Plan | null = null;
  let source: EntitlementSource = "none";
  if (best?.eff.grantsAccess) {
    plan = planFor(best.sub.planId);
    source = "subscription";
  } else {
    const grant = overrides.find((o) => o.effect === "grant");
    if (grant) {
      plan = planFor(grant.planId);
      source = plan ? "override" : "none";
    }
  }
  const limits = plan?.creatorLimits ?? null;
  const planActive = plan !== null;
  const canPublish = approvedCreator && planActive && Boolean(limits?.canPublish);
  const reason = !approvedCreator ? "not_approved" : !planActive ? "no_plan" : !limits?.canPublish ? "plan_excludes_publishing" : "ok";
  return { approvedCreator, planActive, canPublish, limits, planId: plan?.id ?? null, source, reason };
}

/** Checks a creator action against plan limits. */
export function withinCreatorLimit(
  entitlement: CreatorEntitlement,
  kind: "show" | "episode" | "upload",
  usage: { shows: number; episodes: number; uploadedMbThisPeriod: number; storageMb: number },
  addMb = 0,
): { ok: true } | { ok: false; message: string } {
  const limits = entitlement.limits;
  if (!limits) return { ok: false, message: "An active creator plan is required." };
  if (kind === "show" && usage.shows >= limits.maxShows) return { ok: false, message: `Your plan allows ${limits.maxShows} show(s).` };
  if (kind === "episode" && usage.episodes >= limits.maxEpisodes) return { ok: false, message: `Your plan allows ${limits.maxEpisodes} episode(s).` };
  if (kind === "upload") {
    if (usage.uploadedMbThisPeriod + addMb > limits.uploadAllowanceMb) return { ok: false, message: "This upload exceeds your plan's upload allowance for the period." };
    if (usage.storageMb + addMb > limits.storageMb) return { ok: false, message: "This upload exceeds your plan's storage allowance." };
  }
  return { ok: true };
}
