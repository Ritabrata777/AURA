"use client";

import type { ReactNode } from "react";
import { LogOut } from "lucide-react";
import type { SessionUser } from "../lib/types";
import { glassPanel, InnerGlow, KioskScreen } from "./kiosk";

interface NavItem {
  href: string;
  label: string;
  active?: boolean;
}

interface AppShellProps {
  user: SessionUser;
  onLogout: () => void;
  eyebrow: string;
  title: string;
  nav: NavItem[];
  headerAside?: ReactNode;
  children: ReactNode;
}

export function AppShell({
  user,
  onLogout,
  eyebrow,
  title,
  nav,
  headerAside,
  children,
}: AppShellProps) {
  return (
    <KioskScreen className="flex flex-col gap-4 overflow-x-hidden p-4">
      <header className={`${glassPanel} flex flex-wrap items-center justify-between gap-4 px-6 py-3`}>
        <InnerGlow />
        <div>
          <p className="text-[11px] font-bold tracking-[1.3px] text-white/50 uppercase">{eyebrow}</p>
          <h1 className="text-xl font-bold tracking-tight">{title}</h1>
        </div>

        <nav className="flex flex-wrap gap-2">
          {nav.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                item.active
                  ? "border border-white/20 bg-white/15 text-white"
                  : "text-white/50 hover:bg-white/10 hover:text-white"
              }`}
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          {headerAside}
          <div className="hidden text-right text-xs sm:block">
            <strong className="block text-white">{user.email}</strong>
            <span className="text-white/50">
              {user.role === "DOCTOR" ? "Clinician account" : "Patient account"}
            </span>
          </div>
          <button
            className="rounded-xl border border-white/15 bg-white/5 p-2.5 text-white/70 transition hover:bg-white/10 hover:text-white"
            onClick={onLogout}
            title="Sign out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-4 pb-8">{children}</div>
    </KioskScreen>
  );
}
