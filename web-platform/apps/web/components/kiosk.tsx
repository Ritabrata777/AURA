import type { CSSProperties, ReactNode } from "react";

export const kioskBgStyle: CSSProperties = {
  backgroundImage:
    "radial-gradient(at 0% 0%, #1c1c1e 0px, transparent 50%), radial-gradient(at 100% 0%, #241536 0px, transparent 50%), radial-gradient(at 100% 100%, #1c1c1e 0px, transparent 50%), radial-gradient(at 0% 100%, #201628 0px, transparent 50%)",
};

export const glassPanel =
  "relative overflow-hidden rounded-3xl bg-white/5 backdrop-blur-md border border-white/15 shadow-2xl";

/**
 * Smaller sibling of glassPanel for dense cards, table shells, and strips.
 * Deliberately carries no backdrop-filter: there are dozens of these on a
 * page, and stacked backdrop-filter layers are the main source of scroll
 * jank in Chromium. On the static gradient background the frosted look is
 * carried by the translucent fill alone.
 */
export const glassCard =
  "relative overflow-hidden rounded-2xl bg-white/5 border border-white/10 shadow-xl";

export function InnerGlow() {
  return (
    <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent" />
  );
}

export function KioskScreen({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`relative min-h-screen w-full bg-[#121212] font-sans text-white ${className}`}
      style={kioskBgStyle}
    >
      {children}
    </div>
  );
}
