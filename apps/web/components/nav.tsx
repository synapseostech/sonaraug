"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { brand } from "@kito/config";
import {
  HomeIcon,
  LibraryIcon,
  MedicalIcon,
  PodcastIcon,
  RadioIcon,
  SearchIcon,
  StarIcon,
  UserIcon,
  VideoIcon,
} from "@kito/ui";
import { verifiedStations } from "../lib/data/queries.ts";

/** True only when at least one real station is both technically verified and rights-cleared. */
const RADIO_PLAYS = verifiedStations.length > 0;

/** What the shell needs to know about the signed-in person. Never includes private data. */
export type ShellViewer = { displayName: string; isStaff: boolean; emailVerified: boolean } | null;

type NavItem = { href: string; label: string; short?: string; icon: ReactNode };

export const PRIMARY_NAV: NavItem[] = [
  { href: "/", label: "Home", icon: <HomeIcon /> },
  { href: "/radio", label: "Radio", icon: <RadioIcon /> },
  { href: "/podcasts", label: "Podcasts", icon: <PodcastIcon /> },
  { href: "/medical-chronicles", label: "Medical Chronicles", short: "Chronicles", icon: <MedicalIcon /> },
  { href: "/watch", label: "Watch", icon: <VideoIcon /> },
  { href: "/library", label: "Library", icon: <LibraryIcon /> },
];

function useIsActive() {
  const pathname = usePathname() ?? "/";
  return (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));
}

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="brandmark__link" aria-label={`${brand.name} home`} style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span className="brandmark" aria-hidden="true">
        {brand.name.slice(0, 1)}
      </span>
      <span>
        <span className="brandmark__name">{brand.name}</span>
        {compact ? null : <span className="brandmark__tag">Radio · Podcasts · Video</span>}
      </span>
    </Link>
  );
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link href={item.href} className={`navlink${active ? " is-active" : ""}`} aria-current={active ? "page" : undefined}>
      {item.icon}
      {item.label}
    </Link>
  );
}

export function Sidebar({ viewer }: { viewer: ShellViewer }) {
  const isActive = useIsActive();
  const discover = PRIMARY_NAV.filter((item) => item.href !== "/library");
  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <BrandMark />
      </div>
      <nav className="sidebar__nav" aria-label="Primary">
        <p className="sidebar__label">Discover</p>
        {discover.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(item.href)} />
        ))}
        <p className="sidebar__label">You</p>
        <NavLink item={{ href: "/library", label: "Library", icon: <LibraryIcon /> }} active={isActive("/library")} />
        <NavLink item={{ href: "/subscribe", label: "Subscribe", icon: <StarIcon /> }} active={isActive("/subscribe")} />
        {viewer ? (
          <NavLink item={{ href: "/account", label: "Account", icon: <UserIcon /> }} active={isActive("/account")} />
        ) : (
          <NavLink item={{ href: "/auth/login", label: "Sign in", icon: <UserIcon /> }} active={isActive("/auth")} />
        )}
        <p className="sidebar__label">Find</p>
        <NavLink item={{ href: "/search", label: "Search", icon: <SearchIcon /> }} active={isActive("/search")} />
        {viewer?.isStaff ? (
          <>
            <p className="sidebar__label">Workspaces</p>
            <Link href="/admin" className="navlink">
              Admin console
            </Link>
          </>
        ) : null}
      </nav>
      <div className="sidebar__footer">
        {RADIO_PLAYS ? (
          <>
            <strong>Live radio is real</strong>
            Stations marked “verified live” play the broadcaster&apos;s own stream. General podcasts, video and demo stations remain sample content.
          </>
        ) : (
          <>
            <strong>Radio rights review</strong>
            Broadcaster permission has been reported, but music rights must also be cleared before Sonara can play these streams.
            General podcasts, video and demo stations are sample content.
          </>
        )}
      </div>
    </aside>
  );
}

export function TopBar({ viewer }: { viewer: ShellViewer }) {
  const router = useRouter();
  const [query, setQuery] = useState("");

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = query.trim();
    router.push(trimmed ? `/search?q=${encodeURIComponent(trimmed)}` : "/search");
  };

  return (
    <header className="topbar">
      <div className="topbar__mobile-brand">
        <BrandMark compact />
      </div>
      <form className="searchbox" role="search" onSubmit={submit}>
        <SearchIcon size={17} />
        <input
          type="search"
          name="q"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search stations, shows, episodes, videos"
          aria-label="Search the catalogue"
          autoComplete="off"
        />
      </form>
      <div className="topbar__actions">
        <span
          className="demo-pill"
          title={
            RADIO_PLAYS
              ? "Radio plays verified live Ugandan streams; general podcasts and video are sample content."
              : "No station is cleared for playback yet. Broadcaster and music rights must both be cleared."
          }
        >
          <span aria-hidden="true">●</span> {RADIO_PLAYS ? "Live radio enabled" : "Radio rights review"}
        </span>
        {viewer ? (
          <Link href="/account" className="sn-account-chip" aria-label={`Your account (${viewer.displayName})`}>
            <span className="sn-account-chip__avatar" aria-hidden="true">
              {viewer.displayName.slice(0, 1).toUpperCase()}
            </span>
            <span className="sn-account-chip__name">Account</span>
          </Link>
        ) : (
          <>
            <Link href="/auth/login" className="kt-btn kt-btn--ghost kt-btn--sm">
              Sign in
            </Link>
            <Link href="/auth/register" className="kt-btn kt-btn--primary kt-btn--sm sn-hide-xs">
              Create account
            </Link>
          </>
        )}
      </div>
    </header>
  );
}

export function BottomNav() {
  const isActive = useIsActive();
  return (
    <nav className="bottomnav" aria-label="Primary (mobile)">
      {PRIMARY_NAV.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`bottomnav__item${isActive(item.href) ? " is-active" : ""}`}
          aria-current={isActive(item.href) ? "page" : undefined}
        >
          {item.icon}
          {item.short ?? item.label}
        </Link>
      ))}
    </nav>
  );
}
