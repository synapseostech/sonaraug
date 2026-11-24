import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { brand, darkTheme } from "@kito/config";
import { cssVariables } from "@kito/ui";
import "@kito/ui/styles.css";
import "./globals.css";
import "./sonara.css";
import { AppShell } from "../components/app-shell.tsx";
import { LibraryProvider } from "../lib/library.tsx";
import { PlayerProvider } from "../lib/player.tsx";
import { getViewer } from "../lib/server/auth.ts";

export const metadata: Metadata = {
  title: { default: `${brand.name} — ${brand.tagline}`, template: `%s · ${brand.name}` },
  description: "Ugandan radio, podcasts, Medical Chronicles and video. Development build.",
};

export const viewport: Viewport = { themeColor: darkTheme.bg, width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: ReactNode }) {
  // The session is resolved on the server. Only display-safe fields reach the client shell.
  const viewer = await getViewer();
  const shellViewer = viewer ? { displayName: viewer.displayName, isStaff: viewer.isStaff, emailVerified: viewer.emailVerified } : null;
  return (
    <html lang={brand.defaultLocale}>
      <body>
        {/* Design tokens are written from packages/config so there is one source of truth. */}
        <style dangerouslySetInnerHTML={{ __html: `:root{${cssVariables(darkTheme)}}` }} />
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <LibraryProvider>
          <PlayerProvider>
            <AppShell viewer={shellViewer}>{children}</AppShell>
          </PlayerProvider>
        </LibraryProvider>
      </body>
    </html>
  );
}
