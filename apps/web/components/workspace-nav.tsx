"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { BrandMark } from "./nav.tsx";
import { staffCan, type StaffPermission } from "@kito/auth";
import type { PlatformRole } from "@kito/types";
import { useStudio } from "../lib/studio/store.tsx";

export type WorkspaceLink = { href: string; label: string; badge?: string; permission?: StaffPermission; demo?: boolean };

export type StaffSummary = { displayName: string; roles: readonly PlatformRole[] };

export const STUDIO_NAV: readonly { section: string; links: readonly WorkspaceLink[] }[] = [
  {
    section: "Creator",
    links: [
      { href: "/studio", label: "Overview" },
      { href: "/studio/podcasts", label: "My podcasts" },
      { href: "/studio/episodes", label: "Episodes" },
      { href: "/studio/record", label: "Recording studio" },
      { href: "/studio/media", label: "Media library" },
      { href: "/studio/publishing", label: "Publishing" },
      { href: "/studio/video", label: "Video" },
      { href: "/studio/analytics", label: "Analytics" },
      { href: "/studio/settings", label: "Channel settings" },
    ],
  },
  {
    section: "Broadcaster",
    links: [
      { href: "/studio/broadcast", label: "Station onboarding" },
      { href: "/studio/live", label: "Live broadcast" },
    ],
  },
];

/**
 * Admin navigation. `permission` hides links the signed-in staff member cannot
 * use (the pages enforce the same permission on the server). `demo` marks the
 * pre-existing review screens that still run on local demo data.
 */
export const ADMIN_NAV: readonly { section: string; links: readonly WorkspaceLink[] }[] = [
  {
    section: "Platform",
    links: [
      { href: "/admin", label: "Overview" },
      { href: "/admin/users", label: "Users", permission: "users:read" },
      { href: "/admin/audit-logs", label: "Audit log", permission: "audit:read" },
      { href: "/admin/settings", label: "Settings", permission: "settings:manage" },
    ],
  },
  {
    section: "Medical Chronicles",
    links: [
      { href: "/admin/medical-chronicles", label: "Dashboard", permission: "chronicles:edit" },
      { href: "/admin/medical-chronicles/series", label: "Series", permission: "chronicles:edit" },
      { href: "/admin/medical-chronicles/episodes", label: "Episodes", permission: "chronicles:edit" },
      { href: "/admin/medical-chronicles/review", label: "Review queue", permission: "chronicles:edit" },
      { href: "/admin/medical-chronicles/categories", label: "Categories", permission: "chronicles:edit" },
    ],
  },
  {
    section: "Commerce",
    links: [
      { href: "/admin/subscriptions", label: "Plans & subscriptions", permission: "subscriptions:read" },
      { href: "/admin/payments", label: "Payments", permission: "payments:read" },
    ],
  },
  {
    section: "Review (demo data)",
    links: [
      { href: "/admin/review", label: "Review overview", demo: true },
      { href: "/admin/stations", label: "Station submissions", demo: true },
      { href: "/admin/content", label: "Podcast & video review", demo: true },
      { href: "/admin/creators", label: "Creator applications", demo: true },
      { href: "/admin/rights", label: "Rights evidence", demo: true },
      { href: "/admin/reports", label: "Reported content", demo: true },
      { href: "/admin/history", label: "Moderation history", demo: true },
    ],
  },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/studio" || href === "/admin") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function WorkspaceFrame({ kind, children, staff }: { kind: "studio" | "admin"; children: ReactNode; staff?: StaffSummary }) {
  const pathname = usePathname() ?? "/";
  const studio = useStudio();
  const visible = (link: WorkspaceLink) => !link.permission || (staff ? staffCan(staff.roles, link.permission) : false);
  const groups = (kind === "studio" ? STUDIO_NAV : ADMIN_NAV)
    .map((group) => ({ ...group, links: group.links.filter(visible) }))
    .filter((group) => group.links.length > 0);
  const label = kind === "studio" ? "Creator Studio" : "Admin console";
  const otherHref = kind === "studio" ? "/admin" : "/studio";
  const otherLabel = kind === "studio" ? "Admin console" : "Creator Studio";

  return (
    <div className={`ws-layout ws-layout--${kind}`}>
      <aside className="ws-side">
        <div className="ws-side__brand">
          <BrandMark compact />
          <span className="ws-side__label">{label}</span>
        </div>

        <nav className="ws-side__nav" aria-label={`${label} navigation`}>
          {groups.map((group) => (
            <div key={group.section} className="ws-side__group">
              <p className="ws-side__section">{group.section}</p>
              {group.links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`ws-navlink${isActive(pathname, link.href) ? " is-active" : ""}`}
                  aria-current={isActive(pathname, link.href) ? "page" : undefined}
                >
                  {link.label}
                  {link.demo ? <span className="sn-tag-sim">Demo</span> : null}
                </Link>
              ))}
            </div>
          ))}
        </nav>

        <div className="ws-side__footer">
          {kind === "admin" && staff ? (
            <p className="ws-side__hint">
              Signed in as <strong>{staff.displayName}</strong> ({staff.roles.join(", ")}). Real permissions apply to Platform, Medical Chronicles and Commerce.
            </p>
          ) : null}
          <label className="ws-side__role">
            <span>{kind === "admin" ? "Demo review role" : "Acting as"}</span>
            <select
              value={studio.actor.role}
              onChange={(event) => studio.setRole(event.target.value as typeof studio.actor.role)}
              aria-label="Simulated role"
            >
              <option value="creator">Creator</option>
              <option value="broadcaster">Broadcaster</option>
              <option value="reviewer">Reviewer</option>
              <option value="admin">Administrator</option>
            </select>
          </label>
          <p className="ws-side__hint">
            {kind === "admin"
              ? "This role applies only to the sections marked Demo, which still use local demo data."
              : "Studio roles and data are simulated locally until creator accounts move to the server (next wave)."}
          </p>
          <div className="ws-side__links">
            <Link href="/" className="ws-side__link">
              ← Listener app
            </Link>
            <Link href={otherHref} className="ws-side__link">
              {otherLabel} →
            </Link>
          </div>
          <button type="button" className="ws-side__reset" onClick={studio.resetStudio}>
            Reset demo data
          </button>
        </div>
      </aside>

      <div className="ws-body">
        <div className="ws-topbar">
          <div className="ws-topbar__crumb">
            <span className="ws-topbar__workspace">{label}</span>
            <span className="ws-topbar__channel">{kind === "admin" ? (staff?.displayName ?? "") : (studio.channel?.name ?? "No channel")}</span>
          </div>
          <div className="ws-topbar__actions">
            {kind === "admin" ? (
              <span className="ws-topbar__role ws-topbar__role--admin">{staff?.roles[0] ?? "staff"}</span>
            ) : (
              <span className={`ws-topbar__role ws-topbar__role--${studio.actor.role}`}>{studio.actor.role}</span>
            )}
            <Link href="/" className="kt-btn kt-btn--ghost kt-btn--sm">
              Listener app
            </Link>
          </div>
        </div>
        <nav className="ws-mobilenav" aria-label={`${label} navigation (compact)`}>
          {groups.flatMap((group) => group.links).map((link) => (
            <Link key={link.href} href={link.href} className={`ws-mobilenav__link${isActive(pathname, link.href) ? " is-active" : ""}`}>
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="ws-content">{children}</div>
      </div>
    </div>
  );
}
