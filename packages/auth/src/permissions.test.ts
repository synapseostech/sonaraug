import { test } from "node:test";
import assert from "node:assert/strict";
import { can, canInOrg, canPlatform, highestOrgRole, isPlatformAdmin, type Actor } from "./permissions.ts";

const listener: Actor = { userId: "u1", platformRoles: [], memberships: [] };
const editorOfA: Actor = {
  userId: "u2",
  platformRoles: [],
  memberships: [{ orgId: "org-a", role: "editor", accepted: true }],
};
const ownerOfA: Actor = {
  userId: "u3",
  platformRoles: [],
  memberships: [{ orgId: "org-a", role: "owner", accepted: true }],
};
const moderator: Actor = { userId: "u4", platformRoles: ["moderator"], memberships: [] };
const finance: Actor = { userId: "u5", platformRoles: ["finance"], memberships: [] };

test("a listener with no roles can do nothing privileged", () => {
  for (const permission of ["station:write", "member:manage", "moderation:act", "payout:approve"] as const) {
    assert.equal(canPlatform(listener, permission), false, permission);
    assert.equal(can(listener, "org-a", permission), false, permission);
  }
});

test("organisation permissions do not leak across organisations", () => {
  assert.equal(can(editorOfA, "org-a", "station:write"), true);
  assert.equal(can(editorOfA, "org-b", "station:write"), false);
});

test("an unaccepted invitation grants no permissions", () => {
  const invited: Actor = {
    userId: "u9",
    platformRoles: [],
    memberships: [{ orgId: "org-a", role: "owner", accepted: false }],
  };
  assert.equal(can(invited, "org-a", "station:write"), false);
  assert.equal(can(invited, "org-a", "member:manage"), false);
});

test("editors may write content but may not manage members or billing", () => {
  assert.equal(can(editorOfA, "org-a", "station:write"), true);
  assert.equal(can(editorOfA, "org-a", "member:manage"), false);
  assert.equal(can(editorOfA, "org-a", "billing:read"), false);
});

test("owners can manage members and see billing", () => {
  assert.equal(can(ownerOfA, "org-a", "member:manage"), true);
  assert.equal(can(ownerOfA, "org-a", "billing:read"), true);
});

test("moderators can moderate but cannot review verification or approve payouts", () => {
  assert.equal(canPlatform(moderator, "moderation:act"), true);
  assert.equal(canPlatform(moderator, "verification:review"), false);
  assert.equal(canPlatform(moderator, "payout:approve"), false);
  assert.equal(isPlatformAdmin(moderator.platformRoles), false);
});

test("finance can approve payouts but cannot moderate content", () => {
  assert.equal(canPlatform(finance, "payout:approve"), true);
  assert.equal(canPlatform(finance, "moderation:act"), false);
});

test("platform admins bypass organisation scoping", () => {
  const admin: Actor = { userId: "u6", platformRoles: ["admin"], memberships: [] };
  assert.equal(can(admin, "org-z", "station:publish"), true);
  assert.equal(isPlatformAdmin(admin.platformRoles), true);
});

test("super_admin is the only role satisfying the platform:admin gate", () => {
  assert.equal(canPlatform({ userId: "a", platformRoles: ["admin"], memberships: [] }, "platform:admin"), true);
  assert.equal(canPlatform(moderator, "platform:admin"), false);
  assert.equal(isPlatformAdmin(["super_admin"]), true);
});

test("highestOrgRole resolves the strongest accepted membership", () => {
  const mixed: Actor = {
    userId: "u7",
    platformRoles: [],
    memberships: [
      { orgId: "org-a", role: "analyst", accepted: true },
      { orgId: "org-a", role: "admin", accepted: true },
    ],
  };
  assert.equal(highestOrgRole(mixed, "org-a"), "admin");
  assert.equal(highestOrgRole(mixed, "org-b"), null);
});
