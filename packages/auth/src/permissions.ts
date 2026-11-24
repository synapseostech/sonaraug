import type { OrgMemberRole, PlatformRole } from "@kito/types";

/**
 * Permission model.
 *
 * Deliberately a pure, serialisable matrix rather than scattered `if role ===`
 * checks in components. Every write path in studio/admin must call
 * `can(...)`; the same permission names are enforced again in Postgres RLS,
 * so a client bug cannot become a data breach.
 */

export type Permission =
  | "station:read"
  | "station:write"
  | "station:publish"
  | "stream:write"
  | "schedule:write"
  | "podcast:write"
  | "video:write"
  | "episode:publish"
  | "analytics:read"
  | "member:manage"
  | "billing:read"
  | "campaign:write"
  | "advertiser:read"
  | "moderation:act"
  | "verification:review"
  | "rights:write"
  | "payout:approve"
  | "platform:admin";

const ORG_ROLE_PERMISSIONS: Record<OrgMemberRole, readonly Permission[]> = {
  owner: [
    "station:read",
    "station:write",
    "station:publish",
    "stream:write",
    "schedule:write",
    "podcast:write",
    "video:write",
    "episode:publish",
    "analytics:read",
    "member:manage",
    "billing:read",
    "campaign:write",
    "advertiser:read",
  ],
  admin: [
    "station:read",
    "station:write",
    "station:publish",
    "stream:write",
    "schedule:write",
    "podcast:write",
    "video:write",
    "episode:publish",
    "analytics:read",
    "member:manage",
    "advertiser:read",
  ],
  editor: [
    "station:read",
    "station:write",
    "stream:write",
    "schedule:write",
    "podcast:write",
    "video:write",
    "episode:publish",
    "analytics:read",
    "advertiser:read",
  ],
  presenter: ["station:read", "schedule:write", "analytics:read"],
  analyst: ["station:read", "analytics:read", "advertiser:read"],
  billing: ["billing:read", "advertiser:read"],
};

const PLATFORM_ROLE_PERMISSIONS: Record<PlatformRole, readonly Permission[]> = {
  super_admin: ["platform:admin"],
  admin: [
    "platform:admin",
    "moderation:act",
    "verification:review",
    "rights:write",
    "station:publish",
    "episode:publish",
    "analytics:read",
  ],
  moderator: ["moderation:act", "station:read", "analytics:read"],
  support: ["station:read", "analytics:read"],
  finance: ["payout:approve", "advertiser:read", "billing:read", "analytics:read"],
  content_editor: ["analytics:read"],
  medical_reviewer: ["analytics:read"],
};

export type OrgMembership = {
  readonly orgId: string;
  readonly role: OrgMemberRole;
  /** Invitations that have not been accepted grant nothing. */
  readonly accepted: boolean;
};

export type Actor = {
  readonly userId: string;
  readonly platformRoles: readonly PlatformRole[];
  readonly memberships: readonly OrgMembership[];
};

export const permissionsForOrgRole = (role: OrgMemberRole): readonly Permission[] => ORG_ROLE_PERMISSIONS[role];
export const permissionsForPlatformRole = (role: PlatformRole): readonly Permission[] => PLATFORM_ROLE_PERMISSIONS[role];

export const isPlatformAdmin = (roles: readonly PlatformRole[]): boolean =>
  roles.some((role) => role === "super_admin" || role === "admin");

/** Platform-wide permission check (not scoped to an organisation). */
export function canPlatform(actor: Actor, permission: Permission): boolean {
  if (permission === "platform:admin") return isPlatformAdmin(actor.platformRoles);
  return actor.platformRoles.some((role) => PLATFORM_ROLE_PERMISSIONS[role]?.includes(permission) === true);
}

/** Organisation-scoped check. Never returns true for an unaccepted invite. */
export function canInOrg(actor: Actor, orgId: string, permission: Permission): boolean {
  if (canPlatform(actor, "platform:admin")) return true;
  return actor.memberships.some(
    (m) => m.orgId === orgId && m.accepted && ORG_ROLE_PERMISSIONS[m.role].includes(permission),
  );
}

/** Convenience: platform admin OR org member with the permission. */
export const can = (actor: Actor, orgId: string, permission: Permission): boolean => canInOrg(actor, orgId, permission);

export const highestOrgRole = (actor: Actor, orgId: string): OrgMemberRole | null => {
  const order: OrgMemberRole[] = ["owner", "admin", "editor", "presenter", "analyst", "billing"];
  const roles = actor.memberships.filter((m) => m.orgId === orgId && m.accepted).map((m) => m.role);
  return order.find((role) => roles.includes(role)) ?? null;
};
