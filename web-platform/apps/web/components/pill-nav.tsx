"use client";

import Link from "next/link";
import { HeartPulse, LogOut, Menu, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

const PILL_BACKGROUND =
  "linear-gradient(to right, rgba(124,58,237,0.38), rgba(20,23,30,0.28) 40%, rgba(14,17,22,0.24))";

/** Past this many pixels the bar is considered "scrolled" and condenses. */
const CONDENSE_AT = 24;

/**
 * Tracks whether the page has scrolled past CONDENSE_AT.
 */
function useCondensed(): boolean {
  const [condensed, setCondensed] = useState(false);

  useEffect(() => {
    const read = () => {
      const next = window.scrollY > CONDENSE_AT;
      setCondensed((previous) => (previous === next ? previous : next));
    };

    read();
    window.addEventListener("scroll", read, { passive: true });
    return () => window.removeEventListener("scroll", read);
  }, []);

  return condensed;
}

interface LinkItem {
  label: string;
  href: string;
}

/**
 * The floating pill navigation with modern header design.
 * Features:
 * - Floating pill that condenses on scroll
 * - Desktop: horizontal nav with logo and links
 * - Mobile: hamburger menu with full-screen overlay
 * - Smooth animations and transitions
 */
export function PillNav({
  brandHref,
  links = [],
  activeHref,
  onLogout,
  children,
}: {
  brandHref: string;
  links?: LinkItem[];
  activeHref?: string;
  onLogout: () => void;
  children?: ReactNode;
}) {
  const condensed = useCondensed();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen]);

  const ease = "transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]";
  const linkTransition = "transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]";

  return (
    <>
      {/* Main navigation header */}
      <header
        className={`pointer-events-none fixed inset-x-0 top-0 z-50 flex flex-col justify-center ${ease} translate-y-0 pt-0 lg:pt-2`}
      >
        <nav
          aria-label="Primary"
          className={`pointer-events-auto mx-auto flex w-full items-center justify-center select-none ${ease} lg:max-w-fit lg:gap-2 lg:px-2 lg:py-1.5 lg:rounded-full lg:border lg:backdrop-blur-2xl lg:backdrop-saturate-150 lg:bg-[#1a1a2e]/80 lg:border-white/15 px-4 py-2.5 rounded-full bg-[#1a1a2e]/90 border-white/10 relative z-20 text-white shadow-2xl`}
          style={{ backgroundImage: condensed ? PILL_BACKGROUND : undefined }}
        >
          {/* Desktop navigation links */}
          <div className="hidden lg:flex items-center gap-1 pointer-events-auto">
            {links.map((link, index) => {
              const active = activeHref != null && link.href === activeHref;
              return (
                <Link
                  key={link.label}
                  href={link.href}
                  className={`group relative inline-flex items-center shrink-0 text-[11px] font-medium uppercase leading-none tracking-wide transition-colors duration-300 ${
                    active ? "text-white" : "text-white/60 hover:text-white/80"
                  }`}
                  style={{ transitionDelay: `${index * 30}ms` }}
                >
                  <span className="relative z-10 px-3 py-2">{link.label}</span>
                  <span
                    className={`absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-violet-500 to-purple-500 transition-transform duration-300 ease-out origin-left ${
                      active ? "scale-x-100 shadow-[0_0_8px_rgba(139,92,246,0.5)]" : "scale-x-0 group-hover:scale-x-100"
                    }`}
                  />
                </Link>
              );
            })}
          </div>

          {/* Divider */}
          <div className="hidden lg:block h-4 w-px bg-white/15 mx-1" />

          {/* Status chips / children */}
          <div className="hidden lg:flex shrink-0 items-center gap-2 pl-2">{children}</div>

          {/* Logout button */}
          <button
            onClick={onLogout}
            aria-label="Log out"
            title="Log out"
            className="hidden lg:inline-flex shrink-0 items-center justify-center rounded-full p-2 text-white/60 transition-colors hover:bg-white/10 hover:text-white ml-1"
          >
            <LogOut className="h-4 w-4" />
          </button>

          {/* Mobile menu button */}
          <div className={`ml-auto flex justify-end ${linkTransition} relative z-10 opacity-100 translate-y-0 pointer-events-auto lg:hidden`}>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="w-10 h-10 flex flex-col items-center justify-center gap-1.5 focus:outline-none relative pointer-events-auto transition-all duration-500 rounded-full backdrop-blur-xl backdrop-saturate-150 border bg-white/10 border-white/20"
              aria-label="Toggle Menu"
            >
              {mobileMenuOpen ? (
                <X className="w-5 h-5 text-white transition-all duration-300" />
              ) : (
                <>
                  <span className="w-5 h-[2px] transition-all duration-300 ease-out origin-center bg-white" />
                  <span className="w-5 h-[2px] transition-all duration-300 ease-out origin-center bg-white" />
                </>
              )}
            </button>
          </div>
        </nav>
      </header>

      {/* Mobile menu overlay */}
      <div
        className={`fixed inset-0 w-full h-[100dvh] overflow-hidden ${ease} lg:hidden backdrop-blur-3xl backdrop-saturate-200 flex flex-col justify-center z-[5] ${
          mobileMenuOpen
            ? "opacity-100 visible pointer-events-auto bg-gradient-to-br from-black/90 via-black/80 to-black/90"
            : "opacity-0 invisible pointer-events-none bg-black/90"
        }`}
      >
        <div className="flex flex-col items-center gap-6 px-6 max-h-[70vh] overflow-y-auto py-8">
          {links.map((link, index) => (
            <div key={link.label} className="w-full text-center overflow-hidden py-1">
              <Link
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`inline-block text-3xl md:text-4xl lg:text-5xl uppercase tracking-widest hover:opacity-70 font-medium ${linkTransition} transform ${
                  mobileMenuOpen ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
                } ${activeHref === link.href ? "text-violet-400" : "text-white"}`}
                style={{ transitionDelay: mobileMenuOpen ? `${index * 80 + 100}ms` : "0ms" }}
              >
                {link.label}
                {activeHref === link.href && (
                  <span className="block h-0.5 bg-gradient-to-r from-violet-500 to-purple-500 mt-2 rounded-full" />
                )}
              </Link>
            </div>
          ))}

          {/* Mobile logout */}
          <div className="w-full text-center overflow-hidden py-4 mt-6 pt-6 border-t border-white/10">
            <button
              onClick={() => {
                onLogout();
                setMobileMenuOpen(false);
              }}
              className={`inline-block text-3xl md:text-4xl uppercase tracking-widest hover:opacity-70 font-medium ${linkTransition} transform text-red-400 ${
                mobileMenuOpen ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
              }`}
              style={{ transitionDelay: mobileMenuOpen ? `${(links.length + 1) * 80 + 100}ms` : "0ms" }}
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
