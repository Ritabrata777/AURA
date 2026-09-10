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
      <nav className="flex items-center gap-2 rounded-full border border-white/10 bg-black/30 px-6 py-3 backdrop-blur-xl shadow-2xl">
        {/* Brand/Logo */}
        <a
          href={brandHref}
          className="mr-4 flex items-center gap-2 text-lg font-bold text-white"
        >
          <div className="h-6 w-6 rounded bg-gradient-to-r from-red-500 to-pink-600 shadow-lg" />
          AURA
        </a>

        {/* Navigation Items */}
        <div className="flex items-center gap-1">
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
              <div key={item.id} className="relative">
                <button
                  onClick={handleClick}
                  className={cn(
                    "relative flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all duration-300 z-10",
                    isActive
                      ? "bg-white/15 text-white shadow-lg backdrop-blur-sm border border-white/20"
                      : "text-white/70 hover:bg-white/10 hover:text-white"
                  )}
                >
                  {item.icon && (
                    <span className="h-4 w-4">
                      {item.icon}
                    </span>
                  )}
                  <span>{item.label}</span>
                </button>
                
                {/* Limelight effect for active item */}
                {isActive && (
                  <>
                    <div className="absolute inset-0 rounded-full bg-gradient-to-r from-violet-500/30 to-purple-600/30 blur-md animate-pulse" />
                    <div className="absolute inset-0 rounded-full bg-gradient-to-r from-violet-400/20 to-purple-500/20 blur-sm" />
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
            className="ml-4 rounded-full bg-red-500/20 px-4 py-2 text-sm font-medium text-red-400 transition-all duration-300 hover:bg-red-500/30 hover:text-red-300 border border-red-500/30"
          >
            Logout
          </button>
        )}
      </nav>
    </div>
  );
}

export type { LimelightNavProps };