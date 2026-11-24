"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/medical-chronicles", label: "Overview" },
  { href: "/medical-chronicles/categories", label: "Topics & specialties" },
  { href: "/medical-chronicles/search", label: "Search" },
  { href: "/medical-chronicles/subscribe", label: "Subscribe" },
];

/** Medical Chronicles sub-brand bar: identifies the editorial product inside Sonara. */
export function McBand() {
  const pathname = usePathname() ?? "";
  return (
    <div className="mc-band">
      <Link href="/medical-chronicles" className="mc-band__brand" aria-label="Medical Chronicles home">
        <span className="mc-band__mark" aria-hidden="true">
          M
        </span>
        <span>
          Medical Chronicles <span className="sn-small">· by Sonara</span>
        </span>
      </Link>
      <nav className="mc-band__nav" aria-label="Medical Chronicles">
        {LINKS.map((link) => {
          const active = link.href === "/medical-chronicles" ? pathname === link.href : pathname.startsWith(link.href);
          return (
            <Link key={link.href} href={link.href} aria-current={active ? "page" : undefined}>
              {link.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
