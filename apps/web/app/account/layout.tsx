import Link from "next/link";
import type { ReactNode } from "react";
import { Notice } from "../../components/sonara/ui.tsx";
import { requireViewer } from "../../lib/server/auth.ts";
import { AccountNav } from "./nav.tsx";

/** Every account page is private: the layout requires a session on the server. */
export default async function AccountLayout({ children }: { children: ReactNode }) {
  const viewer = await requireViewer("/account");
  return (
    <div>
      {!viewer.emailVerified ? (
        <div className="sn-verify-banner">
          <Notice tone="warn" title="Verify your email address">
            You can listen to free episodes now. Verifying is needed to subscribe. <Link className="sn-link" href="/auth/verify-email">Verify or resend</Link>
          </Notice>
        </div>
      ) : null}
      <div className="sn-account">
        <AccountNav />
        <div className="sn-stack--lg">{children}</div>
      </div>
    </div>
  );
}
