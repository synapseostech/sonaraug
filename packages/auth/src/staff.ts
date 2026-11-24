/**
 * Sonara administration permissions and privilege separation.
 *
 * Rules:
 *  1. Nobody can grant or revoke their own roles.
 *  2. Only a super_admin can grant or revoke super_admin or admin.
 *  3. An admin can grant the operational roles (moderator, support, finance,
 *     content_editor, medical_reviewer) to *other* users.
 *  4. The last super_admin cannot be removed.
 *  5. Suspending a staff member is a super_admin action.
 * The same rules are enforced by the database (migration 0120, grant_platform_role).
 */
import type { PlatformRole } from "@kito/types";

export type StaffPermission =
  | "admin:access"
  | "users:read"
  | "users:manage"
  | "roles:grant"
  | "chronicles:edit"
  | "chronicles:review"
  | "chronicles:categories"
  | "creators:review"
  | "plans:manage"
  | "subscriptions:read"
  | "subscriptions:override"
  | "payments:read"
  | "payments:reconcile"
  | "audit:read"
  | "settings:manage"
  | "moderation:act";

export const ALL_PLATFORM_ROLES: readonly PlatformRole[] = [
  "super_admin",
  "admin",
  "finance",
  "moderator",
  "support",
  "content_editor",
  "medical_reviewer",
];

const EVERYTHING: readonly StaffPermission[] = [
  "admin:access",
  "users:read",
  "users:manage",
  "roles:grant",
  "chronicles:edit",
  "chronicles:review",
  "chronicles:categories",
  "creators:review",
  "plans:manage",
  "subscriptions:read",
  "subscriptions:override",
  "payments:read",
  "payments:reconcile",
  "audit:read",
  "settings:manage",
  "moderation:act",
];

export const STAFF_PERMISSIONS: Readonly<Record<PlatformRole, readonly StaffPermission[]>> = Object.freeze({
  super_admin: EVERYTHING,
  admin: EVERYTHING,
  finance: ["admin:access", "users:read", "plans:manage", "subscriptions:read", "subscriptions:override", "payments:read", "payments:reconcile", "audit:read"],
  moderator: ["admin:access", "users:read", "moderation:act", "creators:review"],
  support: ["admin:access", "users:read", "subscriptions:read", "payments:read"],
  content_editor: ["admin:access", "chronicles:edit"],
  medical_reviewer: ["admin:access", "chronicles:edit", "chronicles:review"],
});

export const ROLE_LABEL: Readonly<Record<PlatformRole, string>> = Object.freeze({
  super_admin: "Super administrator",
  admin: "Administrator",
  finance: "Finance",
  moderator: "Moderator",
  support: "Support",
  content_editor: "Medical Chronicles editor",
  medical_reviewer: "Medical Chronicles reviewer",
});

export function staffCan(roles: readonly PlatformRole[], permission: StaffPermission): boolean {
  return roles.some((role) => STAFF_PERMISSIONS[role]?.includes(permission) === true);
}

export const isStaff = (roles: readonly PlatformRole[]): boolean => staffCan(roles, "admin:access");

const PRIVILEGED: readonly PlatformRole[] = ["super_admin", "admin"];

export type RoleChangeError = "self_change" | "not_permitted" | "privileged_role" | "last_super_admin";

export const ROLE_CHANGE_MESSAGE: Record<RoleChangeError, string> = {
  self_change: "You cannot change your own roles. Ask another administrator.",
  not_permitted: "Your role does not allow granting or revoking roles.",
  privileged_role: "Only a super administrator can grant or revoke administrator roles.",
  last_super_admin: "The last super administrator cannot be removed.",
};

export function canChangeRole(input: {
  actorId: string;
  actorRoles: readonly PlatformRole[];
  targetId: string;
  role: PlatformRole;
  change: "grant" | "revoke";
  /** Number of super_admins currently on the platform. */
  superAdminCount: number;
}): { ok: true } | { ok: false; error: RoleChangeError } {
  if (input.actorId === input.targetId) return { ok: false, error: "self_change" };
  if (!staffCan(input.actorRoles, "roles:grant")) return { ok: false, error: "not_permitted" };
  if (PRIVILEGED.includes(input.role) && !input.actorRoles.includes("super_admin")) return { ok: false, error: "privileged_role" };
  if (input.change === "revoke" && input.role === "super_admin" && input.superAdminCount <= 1) return { ok: false, error: "last_super_admin" };
  return { ok: true };
}

/** Whether an actor may suspend or reactivate the target account. */
export function canChangeAccountStatus(input: { actorId: string; actorRoles: readonly PlatformRole[]; targetId: string; targetRoles: readonly PlatformRole[] }): boolean {
  if (input.actorId === input.targetId) return false;
  if (!staffCan(input.actorRoles, "users:manage")) return false;
  if (input.targetRoles.length > 0 && !input.actorRoles.includes("super_admin")) return false;
  return true;
}
