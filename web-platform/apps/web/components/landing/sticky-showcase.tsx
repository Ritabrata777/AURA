"use client";

import { useRef } from "react";
import { motion, useScroll, useSpring, useTransform, type MotionValue } from "framer-motion";
import { LiquidGlass } from "./liquid-glass";
import { CompanionScene, EcgScene, TrendsScene, VitalsScene } from "./slides";

/**
 * A scroll-driven sticky image showcase, in the spirit of Codrops'
 * "Sticky Image Effect" (Anemolo/StickyImageEffect), rebuilt for this stack:
 *
 * A glass frame stays pinned to the viewport (position: sticky) while the text
 * sections beside it scroll past. Each section's position in the scroll range
 * drives its image inside the frame — the outgoing slide shrinks and fades as
 * the incoming one grows in, which produces the liquid swap the original
 * implements with Three.js.
 *
 * Geometry: N sections of exactly one viewport height each. While the frame is
 * stuck, the container scrolls (N-1) viewport heights, so slide i is centered
 * at global progress i/(N-1) and cross-fades across the middle of the step
 * between its neighbours.
 */

const SLIDES = [
  {
    kicker: "Live vitals",
    title: "Your body, at a glance.",
    body: "Heart rate, SpO₂, skin temperature and battery health stream from the bedside monitor to every screen you own — no cables, no waiting.",
    accent: "text-violet-300",
    chip: "bg-violet-500/20 text-violet-300",
    Scene: VitalsScene,
  },
  {
    kicker: "Clinical view",
    title: "Single-lead ECG, streamed live.",
    body: "A 500 Hz ECG pipeline renders beat-by-beat waveforms for the patient, and replays every session for clinician review afterwards.",
    accent: "text-green-300",
    chip: "bg-green-500/20 text-green-300",
    Scene: EcgScene,
  },
  {
    kicker: "Trends",
    title: "Days of data, one look.",
    body: "Measurements fold into trends, thresholds and streaks, so drift is visible long before it becomes an emergency.",
    accent: "text-fuchsia-300",
    chip: "bg-fuchsia-500/20 text-fuchsia-300",
    Scene: TrendsScene,
  },
  {
    kicker: "PulseLink Intelligence",
    title: "An AI that explains your numbers.",
    body: "Ask the built-in companion about last night's sleep or what a dip in HRV means — in your own language. It explains; it never diagnoses.",
    accent: "text-purple-300",
    chip: "bg-purple-500/20 text-purple-300",
    Scene: CompanionScene,
  },
] as const;

const N = SLIDES.length;
const STEP = 1 / (N - 1);

/** One pinned image inside the sticky frame, driven by global scroll progress. */
function StageSlide({
  index,
  progress,
}: {
  index: number;
  progress: MotionValue<number>;
}) {
  const center = index * STEP;

  // Each slide is fully visible at its center and hands over to the neighbour
  // across the middle 24% of the step, so the swap reads as one liquid move.
  const range = [center - STEP * 0.5, center - STEP * 0.12, center + STEP * 0.12, center + STEP * 0.5];
  const opacity = useTransform(progress, range, [0, 1, 1, 0]);
  const scale = useTransform(progress, range, [0.82, 1, 1, 0.82]);
  const y = useTransform(progress, range, [28, 0, 0, -28]);

  const { Scene } = SLIDES[index];

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center"
      style={{ opacity, scale, y }}
      aria-hidden={index !== 0 ? true : undefined}
    >
      <Scene />
    </motion.div>
  );
}

/** One scrolling text section, alternating sides on desktop. */
function ShowcaseSection({
  index,
}: {
  index: number;
}) {
  const slide = SLIDES[index];
  const alignRight = index % 2 === 1;

  return (
    <section
      className="flex h-screen items-end pb-[6vh] md:items-center md:pb-0"
      aria-label={slide.kicker}
    >
      <div
        className={`w-full px-6 md:flex md:px-[6vw] ${alignRight ? "md:justify-end" : "md:justify-start"}`}
      >
        {/* Not `quiet`: these four panels float above the pinned imagery, so
            real backdrop blur makes the overlap read as intentional glass. */}
        <LiquidGlass className="max-w-[26rem] rounded-[28px] p-6 sm:p-8">
          <span
            className={`inline-block rounded-full px-3 py-1 text-[11px] font-bold tracking-[0.14em] uppercase ${slide.chip}`}
          >
            {slide.kicker}
          </span>
          <h3 className="mt-4 text-2xl font-bold tracking-tight text-white sm:text-3xl">
            {slide.title}
          </h3>
          <p className="mt-3 text-sm leading-relaxed text-white/55 sm:text-[15px]">
            {slide.body}
          </p>
          <span className="mt-5 block text-[11px] font-semibold tracking-[0.2em] text-white/30 uppercase">
            {String(index + 1).padStart(2, "0")} / {String(N).padStart(2, "0")}
          </span>
        </LiquidGlass>
      </div>
    </section>
  );
}

/** Dot rail mirroring which slide is currently pinned. */
function SlideDots({ progress }: { progress: MotionValue<number> }) {
  return (
    <div className="absolute top-1/2 right-5 z-20 hidden -translate-y-1/2 flex-col gap-2.5 md:flex">
      {SLIDES.map((_, index) => {
        const center = index * STEP;
        const active = useTransform(
          progress,
          [center - STEP * 0.4, center - STEP * 0.1, center + STEP * 0.1, center + STEP * 0.4],
          [0.25, 1, 1, 0.25],
        );
        return (
          <motion.span
            key={index}
            style={{ opacity: active }}
            className="h-1.5 w-1.5 rounded-full bg-white"
          />
        );
      })}
    </div>
  );
}

export function StickyShowcase() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"],
  });

  // Gentle spring so the pinned imagery glides instead of locking to the wheel.
  const smooth = useSpring(scrollYProgress, { stiffness: 110, damping: 28, mass: 0.5 });

  return (
    <div id="showcase" ref={containerRef} className="relative" style={{ height: `${N * 100}vh` }}>
      {/* Sticky stage: the pinned glass frame every slide lives in. */}
      <div className="pointer-events-none sticky top-0 flex h-screen items-center justify-center">
        <div className="absolute inset-0 bg-[radial-gradient(at_50%_45%,rgba(139,92,246,0.12)_0px,transparent_60%)]" />
        <LiquidGlass className="relative aspect-[4/3] w-[min(84vw,540px)] -translate-y-[11vh] rounded-[32px] md:w-[min(44vw,540px)] md:translate-y-0">
          <div className="absolute inset-0">
            {SLIDES.map((_, index) => (
              <StageSlide key={index} index={index} progress={smooth} />
            ))}
          </div>
        </LiquidGlass>
        <SlideDots progress={smooth} />
      </div>

      {/* Text sections scrolling over the pinned stage. */}
      <div className="absolute inset-0 z-10">
        {SLIDES.map((slide, index) => (
          <ShowcaseSection key={slide.kicker} index={index} />
        ))}
      </div>
    </div>
  );
}
