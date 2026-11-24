"use client";

/**
 * Chooses the shell for the current route.
 *
 *  - Listener application (incl. Medical Chronicles, accounts, subscriptions):
 *    discovery navigation and the persistent player.
 *  - Workspaces (/studio, /admin): their own professional chrome, no player.
 *  - Development tools (/dev): bare page, clearly not product UI.
 */

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { BottomNav, Sidebar, TopBar, type ShellViewer } from "./nav.tsx";
import { PlayerBar } from "./player-bar.tsx";

export function AppShell({ children, viewer }: { children: ReactNode; viewer: ShellViewer }) {
  const pathname = usePathname() ?? "/";
  const workspace = pathname.startsWith("/studio") || pathname.startsWith("/admin");

  if (workspace || pathname.startsWith("/dev/")) {
    return (
      <div className="ws-root">
        <main className="ws-main" id="main">
          {children}
        </main>
      </div>
    );
  }

  return (
    <>
      <div className="app">
        <Sidebar viewer={viewer} />
        <div className="app__main">
          <TopBar viewer={viewer} />
          <main className="content" id="main">
            {children}
          </main>
        </div>
      </div>
      <PlayerBar />
      <BottomNav />
    </>
  );
}
