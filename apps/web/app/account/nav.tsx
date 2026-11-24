"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const GROUPS = [
  { section: "Account", links: [["/account", "Overview"], ["/account/profile", "Profile"], ["/account/security", "Security"], ["/account/devices", "Devices"]] },
  { section: "Subscription", links: [["/account/subscriptions", "Subscriptions"], ["/account/billing", "Billing"], ["/account/payment-history", "Payment history"]] },
  { section: "Listening", links: [["/account/listening-history", "Listening history"], ["/account/saved", "Saved"], ["/account/preferences", "Preferences"], ["/account/notifications", "Notifications"]] },
  { section: "Privacy", links: [["/account/privacy", "Privacy & data"], ["/account/delete-account", "Delete account"]] },
] as const;

export function AccountNav() {
  const pathname = usePathname() ?? "";
  return (
    <nav className="sn-account__nav" aria-label="Account">
      {GROUPS.map((group) => (
        <div key={group.section} style={{ display: "contents" }}>
          <p className="sn-account__section">{group.section}</p>
          {group.links.map(([href, label]) => (
            <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined}>
              {label}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}
