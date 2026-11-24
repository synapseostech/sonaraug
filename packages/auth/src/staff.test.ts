import { test } from "node:test";
import assert from "node:assert/strict";
import { canChangeAccountStatus, canChangeRole, isStaff, staffCan } from "./staff.ts";

test("A-5 an ordinary administrator cannot escalate their own privileges", () => {
  const self = canChangeRole({ actorId: "a", actorRoles: ["admin"], targetId: "a", role: "super_admin", change: "grant", superAdminCount: 1 });
  assert.deepEqual(self, { ok: false, error: "self_change" });
  const other = canChangeRole({ actorId: "a", actorRoles: ["admin"], targetId: "b", role: "admin", change: "grant", superAdminCount: 1 });
  assert.deepEqual(other, { ok: false, error: "privileged_role" });
});

test("even a super administrator cannot change their own roles", () => {
  assert.deepEqual(canChangeRole({ actorId: "s", actorRoles: ["super_admin"], targetId: "s", role: "finance", change: "grant", superAdminCount: 2 }), { ok: false, error: "self_change" });
});

test("admins grant operational roles to others; super admins grant admin", () => {
  assert.deepEqual(canChangeRole({ actorId: "a", actorRoles: ["admin"], targetId: "b", role: "medical_reviewer", change: "grant", superAdminCount: 1 }), { ok: true });
  assert.deepEqual(canChangeRole({ actorId: "s", actorRoles: ["super_admin"], targetId: "b", role: "admin", change: "grant", superAdminCount: 1 }), { ok: true });
  assert.deepEqual(canChangeRole({ actorId: "f", actorRoles: ["finance"], targetId: "b", role: "support", change: "grant", superAdminCount: 1 }), { ok: false, error: "not_permitted" });
});

test("the last super administrator cannot be removed", () => {
  assert.deepEqual(canChangeRole({ actorId: "s1", actorRoles: ["super_admin"], targetId: "s2", role: "super_admin", change: "revoke", superAdminCount: 1 }), { ok: false, error: "last_super_admin" });
});

test("A-4 ordinary users have no staff permissions", () => {
  assert.equal(isStaff([]), false);
  assert.equal(staffCan([], "admin:access"), false);
});

test("editors cannot review; reviewers can; finance cannot touch content", () => {
  assert.equal(staffCan(["content_editor"], "chronicles:review"), false);
  assert.equal(staffCan(["medical_reviewer"], "chronicles:review"), true);
  assert.equal(staffCan(["finance"], "chronicles:edit"), false);
  assert.equal(staffCan(["finance"], "payments:reconcile"), true);
  assert.equal(staffCan(["support"], "payments:reconcile"), false);
});

test("only super admins may suspend other staff; nobody suspends themselves", () => {
  assert.equal(canChangeAccountStatus({ actorId: "a", actorRoles: ["admin"], targetId: "u", targetRoles: [] }), true);
  assert.equal(canChangeAccountStatus({ actorId: "a", actorRoles: ["admin"], targetId: "m", targetRoles: ["moderator"] }), false);
  assert.equal(canChangeAccountStatus({ actorId: "s", actorRoles: ["super_admin"], targetId: "m", targetRoles: ["moderator"] }), true);
  assert.equal(canChangeAccountStatus({ actorId: "a", actorRoles: ["admin"], targetId: "a", targetRoles: ["admin"] }), false);
});
