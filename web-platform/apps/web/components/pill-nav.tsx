"use client";

import Link from "next/link";
import { HeartPulse, LogOut } from "lucide-react";
import type { ReactNode } from "react";

const PILL_BACKGROUND =
  "linear-gradient(to right, rgba(124,58,237,0.38), rgba(20,23,30,0.28) 40%, rgba(14,17,22,0.24))";

/**
 * The floating pill navigation shared by every experience (individual portal,
 * patient dashboard, doctor dashboard). Brand pill on the left, optional
 * links, caller-supplied status chips, and logout at the right end.
 *
 * Links beginning with "/" render as client-side routes; anything else (e.g.
 * "#vitals" anchors within a single-page dashboard) renders as a plain anchor.
 */
export function PillNav({
  brandHref,
  links = [],
  activeHref,
  onLogout,
  children,
}: {
  brandHref: string;
  links?: Array<{ label: string; href: string }>;
  activeHref?: string;
  onLogout: () => void;
  children?: ReactNode;
}) {
  return (
    <header className="fixed left-1/2 top-5 z-40 -translate-x-1/2">
      <nav
        className="pill-nav flex max-w-[94vw] items-center gap-0.5 overflow-x-auto rounded-full border border-white/15 p-1.5 shadow-2xl backdrop-blur-2xl"
        style={{ backgroundImage: PILL_BACKGROUND }}
      >
        <Link
          href={brandHref}
          className="mr-1 flex shrink-0 items-center gap-2 rounded-full bg-violet-600 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-violet-600/30"
        >
          <HeartPulse className="h-4 w-4" />
          AURA
        </Link>

        {links.map((link) => {
          const active = activeHref != null && link.href === activeHref;
          const className = `shrink-0 whitespace-nowrap rounded-full px-3.5 py-2 text-[11px] font-semibold uppercase tracking-wider transition-colors ${
            active
              ? "bg-white/15 text-white"
              : "text-white/70 hover:bg-white/10 hover:text-white"
          }`;
          return link.href.startsWith("/") ? (
            <Link key={link.label} href={link.href} className={className}>
              {link.label}
            </Link>
          ) : (
            <a key={link.label} href={link.href} className={className}>
              {link.label}
            </a>
          );
        })}

        <div className="flex shrink-0 items-center gap-2 pl-1">{children}</div>

        <button
          onClick={onLogout}
          aria-label="Log out"
          title="Log out"
          className="ml-1 shrink-0 rounded-full p-2.5 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </nav>
    </header>
  );
}
