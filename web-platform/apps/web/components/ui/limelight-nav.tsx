"use client";

import React from "react";
import { cn } from "@/lib/utils";

export interface NavItem {
  id: string;
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  href?: string;
  active?: boolean;
}

interface LimelightNavProps {
  className?: string;
  items?: NavItem[];
  onLogout?: () => void;
  brandHref?: string;
  activeHref?: string;
}

const defaultNavItems: NavItem[] = [
  { id: 'dashboard', icon: null, label: 'Dashboard' },
  { id: 'ecg', icon: null, label: 'ECG' },
  { id: 'vitals', icon: null, label: 'Vitals' },
  { id: 'trends', icon: null, label: 'Trends' },
  { id: 'devices', icon: null, label: 'Devices' },
];

export function LimelightNav({
  className = "",
  items = defaultNavItems,
  onLogout,
  brandHref = "/",
  activeHref = ""
}: LimelightNavProps) {
  return (
    <div className={cn(
      "fixed left-1/2 top-8 z-50 hidden -translate-x-1/2 transform lg:block",
      className
    )}>
      <nav className="flex items-center gap-2 rounded-full border border-white/25 bg-gradient-to-r from-white/15 via-white/10 to-white/15 px-6 py-3 backdrop-blur-2xl backdrop-saturate-150 shadow-[0_8px_32px_rgba(0,0,0,0.4),inset_0_0_20px_rgba(255,255,255,0.1)]">
        {/* Brand/Logo */}
        <a
          href={brandHref}
          className="group mr-3 flex shrink-0 items-center gap-2 whitespace-nowrap text-base font-bold transition-all duration-300 hover:scale-105"
        >
          <span className="bg-gradient-to-r from-white via-white/90 to-white/70 bg-clip-text text-transparent drop-shadow-[0_0_10px_rgba(255,255,255,0.3)] transition-all duration-300 group-hover:drop-shadow-[0_0_15px_rgba(255,255,255,0.5)]">
            Pulse Link
          </span>
        </a>

        {/* Navigation Items */}
        <div className="flex items-center gap-1.5">
          {items.map((item) => {
            const isActive = activeHref === item.href || item.active;

            const handleClick = () => {
              if (item.onClick) {
                item.onClick();
              } else if (item.href) {
                window.location.href = item.href;
              }
            };

            return (
              <div key={item.id} className="relative group">
                <button
                  onClick={handleClick}
                  className={cn(
                    "relative flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all duration-300 z-10",
                    isActive
                      ? "bg-white/25 text-white shadow-[inset_0_0_20px_rgba(255,255,255,0.15)] backdrop-blur-md ring-1 ring-white/50"
                      : "text-white/70 hover:bg-white/15 hover:text-white hover:shadow-[0_0_20px_rgba(255,255,255,0.1)] ring-1 ring-white/20 hover:ring-white/30"
                  )}
                >
                  {item.icon && (
                    <span className={cn(
                      "h-4 w-4 transition-all duration-300",
                      isActive && "drop-shadow-[0_0_8px_rgba(139,92,246,0.6)]"
                    )}>
                      {item.icon}
                    </span>
                  )}
                  <span className={cn(
                    isActive && "bg-gradient-to-r from-violet-200 to-white bg-clip-text text-transparent drop-shadow-[0_0_6px_rgba(139,92,246,0.4)]"
                  )}>{item.label}</span>
                </button>

                {/* Limelight effect for active item */}
                {isActive && (
                  <>
                    <div className="absolute inset-0 rounded-full bg-gradient-to-r from-violet-500/40 to-purple-600/40 blur-md animate-pulse" />
                    <div className="absolute inset-0 rounded-full bg-gradient-to-r from-violet-400/30 to-purple-500/30 blur-lg" />
                    <div className="absolute inset-0 rounded-full bg-gradient-to-r from-violet-300/20 to-purple-400/20 blur-xl" />
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* Logout Button */}
        {onLogout && (
          <button
            onClick={onLogout}
            className="group relative ml-2 shrink-0 overflow-hidden rounded-full bg-gradient-to-r from-red-500/25 to-red-600/20 px-5 py-2 text-sm font-medium text-red-300 transition-all duration-300 hover:from-red-500/35 hover:to-red-600/30 hover:text-red-200 hover:shadow-[0_0_20px_rgba(239,68,68,0.3)] ring-1 ring-red-400/30 hover:ring-red-400/50"
          >
            <span className="relative z-10 flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="transition-transform duration-300 group-hover:-translate-x-0.5">
                <path d="m16 17 5-5-5-5"></path>
                <path d="M21 12H9"></path>
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              </svg>
              Logout
            </span>
          </button>
        )}
      </nav>
    </div>
  );
}

export type { LimelightNavProps };
