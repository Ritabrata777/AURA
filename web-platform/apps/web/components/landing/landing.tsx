"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from "framer-motion";
import { Activity, ArrowRight, ChevronDown, Droplets, Heart, ShieldCheck, Sparkles } from "lucide-react";
import { kioskBgStyle } from "../kiosk";
import { GlassChip, LiquidGlass } from "./liquid-glass";
import { StickyShowcase } from "./sticky-showcase";

/**
 * Public landing experience for signed-out visitors: a liquid-glass hero and
 * the scroll-driven sticky image showcase, with every call to action pointing
 * at the dedicated /login sign-in page. Signed-in users never see this —
 * page.tsx routes them straight to their role's dashboard.
 */

/**
 * Nav link: a soft glass pill that fills on hover. `cta` renders the accent
 * gradient "Sign in" button that stands apart from the rest of the pill.
 */
function NavLink({ href, label, cta = false }: { href: string; label: string; cta?: boolean }) {
  return (
    <a
      href={href}
      className={`group inline-flex shrink-0 items-center rounded-full px-3.5 py-2 text-xs leading-none font-semibold tracking-[0.16em] uppercase transition-all duration-300 ${
        cta
          ? "gap-1.5 bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white shadow-[0_8px_24px_-8px_rgba(139,92,246,0.8)] hover:shadow-[0_10px_30px_-6px_rgba(139,92,246,0.95)] hover:brightness-110 active:scale-95"
          : "text-white/65 hover:bg-white/10 hover:text-white hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
      }`}
    >
      {label}
      {cta && (
        <ArrowRight
          size={12}
          className="transition-transform duration-300 group-hover:translate-x-0.5"
        />
      )}
    </a>
  );
}

/**
 * Navigation à la orblinn.com: ONE element that morphs. While the hero is in
 * view it is a full-width transparent strip — wordmark centered on desktop,
 * links on the right. Past the first pixels of scroll the same element
 * condenses into a centered 720px liquid-glass pill (bg-white/5,
 * border-white/10, backdrop-blur-2xl) while the wordmark glides from center
 * to the pill's left edge. The morph is a single long CSS transition on
 * [width,max-width,padding,background,border,radius,margin-top,backdrop-filter]
 * — no cross-fading between two bars. On phones the links collapse into a
 * glass hamburger opening a full-screen frosted menu.
 */
function GlassNav() {
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);

  // Hysteresis: trip into the pill early, back to the bar only near the very
  // top, so the morph never stutters when scrolling hovers around one value.
  useMotionValueEvent(scrollY, "change", (value) => {
    setScrolled((prev) => (prev ? value > 16 : value > 48));
  });

  const [menuOpen, setMenuOpen] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  // Freeze the page behind the full-screen mobile menu.
  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  // Anchor links from the overlay must scroll only AFTER the body unlock
  // lands, otherwise the smooth scroll is cancelled mid-flight by the
  // overflow:hidden that the open menu applies.
  useEffect(() => {
    if (menuOpen || !pendingHref) return;
    document.querySelector(pendingHref)?.scrollIntoView({ behavior: "smooth" });
    setPendingHref(null);
  }, [menuOpen, pendingHref]);

  const links = [
    { href: "#showcase", label: "How it works" },
    { href: "/safety", label: "Safety" },
    { href: "/login", label: "Sign in" },
  ];

  // The morphing pill is structural only (size / radius / margin). The glass
  // body is a backdrop layer inside the nav that fades in via opacity, so the
  // transition is GPU-composited and never animates a backdrop-filter frame.
  const pill = scrolled
    ? "lg:mt-3 lg:max-w-[720px] lg:rounded-full lg:px-6 lg:py-2.5"
    : "";

  const trackGlare = (event: React.PointerEvent<HTMLElement>) => {
    const target = event.currentTarget;
    const rect = target.getBoundingClientRect();
    target.style.setProperty("--lg-x", `${((event.clientX - rect.left) / rect.width) * 100}%`);
    target.style.setProperty("--lg-y", `${((event.clientY - rect.top) / rect.height) * 100}%`);
  };

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center">
      <nav
        aria-label="Primary"
        onPointerMove={trackGlare}
        className={`group pointer-events-auto relative z-20 mx-auto flex w-full min-w-0 select-none items-center justify-between border border-transparent bg-transparent px-6 py-4 text-white transition-[width,max-width,padding,border-radius,margin-top] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] ${pill}`}
      >
        {/* Glass backing: the pill body. Blur stays constant — only opacity
            animates, so the morph renders on the compositor with no per-frame
            backdrop-filter repaints. */}
        <div
          aria-hidden
          className={`pointer-events-none absolute inset-0 -z-10 rounded-full border border-white/15 transition-opacity duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] ${
            scrolled
              ? "opacity-100 shadow-[inset_0_1px_1px_rgba(255,255,255,0.22),inset_0_-1px_2px_rgba(255,255,255,0.06),0_18px_50px_-20px_rgba(0,0,0,0.8)]"
              : "opacity-0"
          }`}
          style={{
            background:
              "linear-gradient(135deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.05) 45%, rgba(255,255,255,0.09) 100%)",
            backdropFilter: "blur(22px) saturate(180%)",
            WebkitBackdropFilter: "blur(22px) saturate(180%)",
          }}
        />

        {/* Pointer-tracking specular glare, only inside the glass pill. */}
        {scrolled && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 hidden rounded-full opacity-0 transition-opacity duration-500 group-hover:opacity-100 lg:block"
            style={{
              background:
                "radial-gradient(420px circle at var(--lg-x, 25%) var(--lg-y, -20%), rgba(255,255,255,0.12), transparent 45%)",
            }}
          />
        )}

        {/* Wordmark: centered in the full-width bar, glides to the pill's left
            edge once condensed. Mobile keeps it docked left beside the burger. */}
        <a
          href="#top"
          className={`absolute top-1/2 left-0 z-10 flex -translate-y-1/2 items-center gap-2.5 transition-[left,transform] duration-700 ease-[cubic-bezier(0.25,1,0.5,1)] ${
            scrolled ? "translate-x-6" : "translate-x-6 lg:left-1/2 lg:-translate-x-1/2"
          }`}
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-[0_0_22px_rgba(139,92,246,0.55),inset_0_1px_1px_rgba(255,255,255,0.5)] ring-1 ring-white/25">
            <ShieldCheck size={17} className="text-white" />
          </span>
          <span className="text-base font-bold tracking-[0.26em] text-white">PulseLink</span>
        </a>

        <div className="ml-auto hidden items-center gap-1 lg:flex">
          {links
            .filter((link) => link.label !== "Sign in")
            .map((link) => (
              <NavLink key={link.href} href={link.href} label={link.label} />
            ))}
          <span aria-hidden className="mx-2 h-4 w-px bg-white/15" />
          <NavLink href="/login" label="Sign in" cta />
        </div>

        <button
          type="button"
          aria-label="Toggle menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
          className="pointer-events-auto relative z-10 flex h-12 w-12 flex-col items-center justify-center gap-1.5 rounded-full border border-white/20 bg-white/10 backdrop-blur-2xl backdrop-saturate-150 lg:hidden"
        >
          <span
            className={`h-[2px] w-6 origin-center bg-white transition-all duration-300 ease-out ${menuOpen ? "-translate-y-[4px] -rotate-45" : ""}`}
          />
          <span
            className={`h-[2px] w-6 origin-center bg-white transition-all duration-300 ease-out ${menuOpen ? "translate-y-[4px] rotate-45" : ""}`}
          />
        </button>
      </nav>

      {/* Full-screen frosted menu, phone-sized screens only. Sits below the
          nav (z-[5] < z-20) so the hamburger stays clickable while open. */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            key="menu"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="pointer-events-auto fixed inset-0 z-[5] flex h-[100dvh] flex-col items-center justify-center bg-black/60 text-white backdrop-blur-3xl backdrop-saturate-200 lg:hidden"
          >
            <div className="flex w-full flex-col items-center gap-8 px-6">
              {links.map((link, index) => (
                <div key={link.href} className="w-full overflow-hidden py-2 text-center">
                  <motion.a
                    href={link.href}
                    onClick={(event) => {
                      // Route links navigate normally; anchors scroll after the
                      // menu (and its body scroll-lock) has gone away.
                      if (link.href.startsWith("#")) {
                        event.preventDefault();
                        setPendingHref(link.href);
                      }
                      setMenuOpen(false);
                    }}
                    initial={{ opacity: 0, x: 80 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 80 }}
                    transition={{
                      duration: 0.7,
                      ease: [0.16, 1, 0.3, 1],
                      delay: index * 0.06,
                    }}
                    className="inline-block py-2 text-4xl font-medium uppercase tracking-widest transition-opacity duration-300 hover:opacity-70 md:text-5xl"
                  >
                    {link.label}
                  </motion.a>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

function Hero() {
  return (
    <header id="top" className="relative flex min-h-screen flex-col overflow-hidden">
      {/* Drifting aurora blobs behind the type. */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="lg-anim-drift absolute -top-40 -left-32 h-[480px] w-[480px] rounded-full bg-violet-600/25 blur-[110px]" />
        <div
          className="lg-anim-drift absolute top-1/4 -right-40 h-[460px] w-[460px] rounded-full bg-fuchsia-600/15 blur-[120px]"
          style={{ animationDelay: "-6s" }}
        />
        <div
          className="lg-anim-drift absolute bottom-[-120px] left-1/4 h-[400px] w-[400px] rounded-full bg-purple-700/20 blur-[100px]"
          style={{ animationDelay: "-12s" }}
        />
      </div>

      {/* Floating vitals chips, desktop only so they never crowd the type. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 hidden lg:block">
        <GlassChip icon={<Heart size={15} />} label="Heart rate" value="72 bpm" accent="text-violet-300" className="absolute top-[24%] left-[9%]" float />
        <GlassChip icon={<Droplets size={15} />} label="SpO₂" value="98 %" accent="text-green-300" className="absolute top-[30%] right-[8%]" float />
        <GlassChip icon={<Activity size={15} />} label="ECG" value="Live · 500 Hz" className="absolute bottom-[26%] left-[12%]" float />
        <GlassChip icon={<ShieldCheck size={15} />} label="Session" value="End-to-end private" accent="text-fuchsia-300" className="absolute right-[10%] bottom-[22%]" float />
      </div>

      <div className="relative flex flex-1 flex-col items-center justify-center px-6 pt-28 pb-24 text-center">
        <LiquidGlass quiet className="lg-anim-float flex items-center gap-2 rounded-full px-4 py-2">
          <Sparkles size={13} className="text-fuchsia-300" />
          <span className="text-[11px] font-semibold tracking-[0.16em] text-white/70 uppercase">
            ESP32-powered health monitoring
          </span>
        </LiquidGlass>

        <h1 className="mt-7 max-w-4xl text-5xl leading-[1.02] font-bold tracking-tighter sm:text-6xl md:text-7xl">
          Every heartbeat,
          <br />
          <span className="bg-gradient-to-r from-violet-300 via-fuchsia-300 to-purple-300 bg-clip-text text-transparent">
            in focus.
          </span>
        </h1>

        <p className="mt-6 max-w-xl text-sm leading-relaxed text-white/55 sm:text-base">
          PulseLink streams vitals and single-lead ECG from the bedside monitor to patients, clinicians
          and personal dashboards — live, low-latency, and private by design.
        </p>

        <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row">
          <a
            href="/login"
            className="flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-sm font-bold text-black shadow-[0_8px_32px_rgba(255,255,255,0.18)] transition-transform hover:scale-[1.03] active:scale-95"
          >
            Get started
            <ArrowRight size={16} />
          </a>
          <LiquidGlass interactive className="rounded-full">
            <a
              href="#showcase"
              className="flex items-center gap-2 px-7 py-3.5 text-sm font-bold text-white/85 transition-colors hover:text-white"
            >
              See it in action
              <ChevronDown size={16} />
            </a>
          </LiquidGlass>
        </div>

        <p className="mt-10 text-[11px] tracking-wide text-white/30">
          Engineering prototype — measurements are not a medical diagnosis.
        </p>
      </div>

      <div aria-hidden className="relative flex justify-center pb-8">
        <ChevronDown size={20} className="animate-bounce text-white/35" />
      </div>
    </header>
  );
}

export function Landing() {
  return (
    <div className="lg-surface-quiet relative min-h-screen w-full bg-[#121212] font-sans text-white" style={kioskBgStyle}>
      <GlassNav />
      <Hero />
      <StickyShowcase />
    </div>
  );
}
