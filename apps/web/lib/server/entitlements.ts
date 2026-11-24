/**
 * Server wiring for the entitlement engine in @kito/billing. Every protected
 * read or action calls one of these with records loaded on the server.
 */
import { creatorEntitlement, listenerEntitlement, type CreatorEntitlement, type ListenerEntitlement } from "@kito/billing";
import { staffCan } from "@kito/auth";
import type { ViewerAccess } from "@kito/chronicles";
import type { Viewer } from "./auth.ts";
import type { DataShape } from "./types.ts";

export function listenerEntitlementFor(data: Readonly<DataShape>, userId: string, now = new Date()): ListenerEntitlement {
  return listenerEntitlement(userId, { subscriptions: data.subscriptions, overrides: data.overrides }, now, data.settings.graceDays);
}

export function creatorEntitlementFor(data: Readonly<DataShape>, userId: string, now = new Date()): CreatorEntitlement {
  const approved = data.creatorApplications.some((a) => a.userId === userId && a.status === "approved");
  return creatorEntitlement(userId, { subscriptions: data.subscriptions, overrides: data.overrides, plans: data.plans }, approved, now, data.settings.graceDays);
}

export function viewerAccess(data: Readonly<DataShape>, viewer: Viewer | null, now = new Date()): ViewerAccess {
  if (!viewer) return { signedIn: false, listenerPremium: false, canPreviewUnpublished: false };
  return {
    signedIn: true,
    listenerPremium: listenerEntitlementFor(data, viewer.id, now).premium,
    canPreviewUnpublished: staffCan(viewer.roles, "chronicles:edit"),
  };
}
