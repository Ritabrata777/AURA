"use client";

import { Activity, BatteryCharging, Droplets, Heart, ShieldCheck, Sparkles, Thermometer } from "lucide-react";
import { GlassChip, LiquidGlass } from "./liquid-glass";

/**
 * The four "images" of the sticky showcase. They are drawn with SVG + CSS in
 * the site's own palette instead of stock photos, so the showcase reads as
 * product imagery while staying fully offline and on-theme.
 *
 * Each scene fills its parent (the glass frame the sticky stage mounts it in).
 */

/** Slide 1 — live vitals: BPM ring with pulse rings and floating stat chips. */
export function VitalsScene() {
  const circumference = 2 * Math.PI * 84;

  return (
    <div className="absolute inset-0 bg-[radial-gradient(at_20%_15%,rgba(139,92,246,0.28)_0px,transparent_55%),radial-gradient(at_85%_90%,rgba(168,85,247,0.2)_0px,transparent_50%)]">
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative flex h-[58%] max-h-56 w-auto aspect-square items-center justify-center">
          {/* Expanding pulse rings behind the dial. */}
          <span className="lg-anim-pulse absolute inset-0 rounded-full border border-violet-400/50" />
          <span
            className="lg-anim-pulse absolute inset-0 rounded-full border border-purple-400/30"
            style={{ animationDelay: "1.2s" }}
          />
          <svg viewBox="0 0 240 240" className="h-full w-full -rotate-90">
            <defs>
              <linearGradient id="aura-ring" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#8b5cf6" />
                <stop offset="100%" stopColor="#d946ef" />
              </linearGradient>
            </defs>
            <circle cx="120" cy="120" r="84" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="12" />
            <circle
              cx="120"
              cy="120"
              r="84"
              fill="none"
              stroke="url(#aura-ring)"
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray={`${circumference * 0.72} ${circumference}`}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <Heart size={20} className="mb-1 text-violet-300" fill="currentColor" />
            <span className="text-4xl font-bold tracking-tight text-white">72</span>
            <span className="text-[10px] font-semibold tracking-[0.2em] text-white/45 uppercase">BPM</span>
          </div>
        </div>
      </div>
      <GlassChip icon={<Droplets size={15} />} label="SpO₂" value="98 %" accent="text-green-300" className="absolute top-[10%] left-[7%]" float />
      <GlassChip icon={<Thermometer size={15} />} label="Skin" value="36.6 °C" className="absolute right-[7%] bottom-[12%]" float />
      <GlassChip icon={<BatteryCharging size={15} />} label="Device" value="82 %" accent="text-white/80" className="absolute bottom-[8%] left-[12%] hidden sm:flex" float />
    </div>
  );
}

/** Slide 2 — ECG: grid, glowing animated trace, and a live badge. */
export function EcgScene() {
  return (
    <div className="absolute inset-0 bg-[radial-gradient(at_75%_20%,rgba(34,197,94,0.2)_0px,transparent_55%),radial-gradient(at_10%_85%,rgba(139,92,246,0.28)_0px,transparent_55%)]">
      <svg viewBox="0 0 600 200" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        <defs>
          <pattern id="aura-ecg-grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
          </pattern>
          <filter id="aura-ecg-glow" x="-20%" y="-40%" width="140%" height="180%">
            <feDropShadow dx="0" dy="0" stdDeviation="5" floodColor="#8b5cf6" floodOpacity="0.75" />
          </filter>
        </defs>
        <rect width="600" height="200" fill="url(#aura-ecg-grid)" />
        <path
          d="M0 110 H70 L82 98 Q92 90 102 98 L114 110 H150 L162 122 L176 34 L190 156 L202 110 H250 Q268 78 286 110 H340 L352 98 Q362 90 372 98 L384 110 H420 L432 122 L446 34 L460 156 L472 110 H600"
          fill="none"
          stroke="#a78bfa"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter="url(#aura-ecg-glow)"
          className="lg-anim-ecg"
        />
      </svg>
      <LiquidGlass quiet className="absolute top-[9%] left-[7%] flex items-center gap-2 rounded-full px-3 py-1.5">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-70" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-red-400" />
        </span>
        <span className="text-[10px] font-bold tracking-[0.18em] text-white/80 uppercase">Live · Lead II</span>
      </LiquidGlass>
      <GlassChip icon={<Activity size={15} />} label="Sampling" value="500 Hz" accent="text-violet-300" className="absolute right-[7%] bottom-[10%]" float />
    </div>
  );
}

/** Slide 3 — trends: smooth area chart with a goal threshold line. */
export function TrendsScene() {
  return (
    <div className="absolute inset-0 bg-[radial-gradient(at_15%_20%,rgba(168,85,247,0.24)_0px,transparent_55%),radial-gradient(at_85%_85%,rgba(139,92,246,0.18)_0px,transparent_50%)]">
      <svg viewBox="0 0 600 220" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        <defs>
          <linearGradient id="aura-trend-line" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#8b5cf6" />
            <stop offset="100%" stopColor="#e879f9" />
          </linearGradient>
          <linearGradient id="aura-trend-fill" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(139,92,246,0.35)" />
            <stop offset="100%" stopColor="rgba(139,92,246,0)" />
          </linearGradient>
        </defs>
        <line x1="0" y1="66" x2="600" y2="66" stroke="rgba(255,255,255,0.22)" strokeWidth="1.5" strokeDasharray="6 8" />
        <path
          d="M0 170 C 60 152 90 122 140 130 S 230 92 280 110 S 380 72 430 90 S 540 42 600 58 L600 220 L0 220 Z"
          fill="url(#aura-trend-fill)"
        />
        <path
          d="M0 170 C 60 152 90 122 140 130 S 230 92 280 110 S 380 72 430 90 S 540 42 600 58"
          fill="none"
          stroke="url(#aura-trend-line)"
          strokeWidth="3.5"
          strokeLinecap="round"
        />
        <circle cx="280" cy="110" r="5" fill="#e879f9" />
        <circle cx="430" cy="90" r="5" fill="#e879f9" />
        <circle cx="600" cy="58" r="5" fill="#f0abfc" />
      </svg>
      <GlassChip icon={<Activity size={15} />} label="Resting HR" value="−4 bpm" accent="text-green-300" className="absolute top-[10%] left-[7%]" float />
      <GlassChip icon={<Heart size={15} />} label="HRV" value="+12 %" accent="text-fuchsia-300" className="absolute right-[7%] bottom-[12%]" float />
      <span className="absolute top-[calc(66/220*100%)] left-[6%] -translate-y-1/2 rounded-md bg-white/10 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-white/60">
        Goal 58 bpm
      </span>
    </div>
  );
}

/** Slide 4 — AI companion: chat bubbles with a typing indicator. */
export function CompanionScene() {
  return (
    <div className="absolute inset-0 flex flex-col justify-center gap-3 bg-[radial-gradient(at_80%_15%,rgba(139,92,246,0.3)_0px,transparent_55%),radial-gradient(at_15%_90%,rgba(168,85,247,0.2)_0px,transparent_55%)] px-[7%]">
      <div className="flex items-start gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-[0_0_16px_rgba(139,92,246,0.5)]">
          <Sparkles size={15} className="text-white" />
        </span>
        <LiquidGlass quiet className="max-w-[62%] rounded-2xl rounded-tl-md px-4 py-3">
          <p className="text-[13px] leading-relaxed text-white/85">
            Good morning — 7 h 12 m of sleep, resting HR dipped to 54 in deep sleep. Want the full breakdown?
          </p>
        </LiquidGlass>
      </div>
      <div className="flex justify-end">
        <LiquidGlass quiet className="max-w-[58%] rounded-2xl rounded-br-md border-violet-400/25 bg-violet-500/15 px-4 py-3">
          <p className="text-[13px] leading-relaxed text-white/90">What did my HRV do this week?</p>
        </LiquidGlass>
      </div>
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-[0_0_16px_rgba(139,92,246,0.5)]">
          <Sparkles size={15} className="text-white" />
        </span>
        <LiquidGlass quiet className="flex items-center gap-1.5 rounded-2xl rounded-tl-md px-4 py-3.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="lg-anim-typing h-1.5 w-1.5 rounded-full bg-white/70"
              style={{ animationDelay: `${i * 0.18}s` }}
            />
          ))}
        </LiquidGlass>
      </div>
      <GlassChip icon={<ShieldCheck size={15} />} label="Guardrail" value="Explains — never diagnoses" accent="text-green-300" className="absolute right-[7%] top-[8%]" float />
    </div>
  );
}
