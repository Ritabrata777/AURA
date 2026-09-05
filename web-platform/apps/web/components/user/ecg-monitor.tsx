"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import { HeartPulse } from "lucide-react";
import type { LiveEcgChunk } from "../../lib/types";

/**
 * Real-signal ECG rendering.
 *
 * Samples arrive from the device over Socket.IO (`ecg:chunk`, 50-sample
 * batches at 250 Hz) and are drawn exactly as received — nothing here
 * synthesizes, filters, or fakes a waveform. Two honest adaptations exist:
 *
 * 1. Per-pixel min/max envelopes. A 10-second window at 250 Hz is 2500
 *    samples over ~900 canvas pixels, so a naive polyline would alias away
 *    the QRS spikes. Each pixel column renders the true min/max range of the
 *    samples it covers, which preserves peaks at any width.
 * 2. Auto-gain with a floor. The AD8232 amplitude depends on electrode
 *    contact, so the vertical scale tracks the signal envelope (smoothed,
 *    with a minimum span so a flat lead renders as a flat line rather than
 *    amplifying noise into mountains).
 */

const PAPER = "#0b1220";
const GRID_MINOR = "#1a2740";
const GRID_MAJOR = "#2b3d5f";
const TRACE = "#34d399";
const TRACE_GLOW = "rgba(52, 211, 153, 0.55)";
const MIN_SPAN = 40; // raw units — keeps a flat lead flat

function drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, w, h);

  ctx.lineWidth = 1;
  for (const [step, color] of [
    [12, GRID_MINOR],
    [60, GRID_MAJOR],
  ] as const) {
    ctx.strokeStyle = color;
    ctx.beginPath();
    for (let x = step; x < w; x += step) {
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, h);
    }
    for (let y = step; y < h; y += step) {
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(w, y + 0.5);
    }
    ctx.stroke();
  }
}

/** Smoothed auto-gain state shared by the live and static renderers. */
class Gain {
  center = 0;
  span = MIN_SPAN;
  private seen = false;

  /** Feed the raw window extremes; call once per frame. */
  update(min: number, max: number) {
    const targetCenter = (min + max) / 2;
    const targetSpan = Math.max(max - min, MIN_SPAN);
    if (!this.seen) {
      this.center = targetCenter;
      this.span = targetSpan;
      this.seen = true;
      return;
    }
    this.center += (targetCenter - this.center) * 0.08;
    this.span += (targetSpan - this.span) * 0.08;
  }

  reset() {
    this.seen = false;
    this.center = 0;
    this.span = MIN_SPAN;
  }
}

export interface EcgMonitorHandle {
  /** Append one real chunk from the wire; sampleRate is latched from it. */
  pushChunk: (samples: number[], sampleRate: number) => void;
  /** Clear the buffer for a new session. */
  reset: () => void;
}

interface EcgMonitorProps {
  state: "idle" | "live" | "ended";
  /** Latest *recorded* heart rate from the pulse oximeter, or null. */
  heartRate?: number | null;
  windowSeconds?: number;
  /**
   * Controlled data source: pass the latest socket chunk and the monitor
   * appends it exactly once (Strict-Mode safe) and blanks the strip whenever
   * the session id changes, so two recordings never blend into one trace.
   * The imperative `pushChunk` ref remains for callers that stream themselves.
   */
  chunk?: LiveEcgChunk | null;
  className?: string;
}

export const EcgMonitor = forwardRef<EcgMonitorHandle, EcgMonitorProps>(
  function EcgMonitor({ state, heartRate, windowSeconds = 10, chunk, className = "" }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // Ring buffer + draw state live outside React so the 5 Hz chunk stream
    // and 60 fps draw loop never trigger a re-render.
    const bufferRef = useRef<Float32Array>(new Float32Array(0));
    const headRef = useRef(0); // next write position
    const filledRef = useRef(0);
    const rateRef = useRef(250);
    const gainRef = useRef(new Gain());
    // The draw loop only repaints when something actually changed — a 60fps
    // redraw of an unchanged canvas is the cheapest way to make a whole page
    // feel sluggish, especially stacked behind backdrop-filter layers.
    const dirtyRef = useRef(true);

    const appendChunk = useCallback(
      (samples: number[], sampleRate: number) => {
        if (!samples.length || sampleRate <= 0) return;
        rateRef.current = sampleRate;

        const capacity = windowSeconds * sampleRate;
        if (bufferRef.current.length !== capacity) {
          bufferRef.current = new Float32Array(capacity);
          headRef.current = 0;
          filledRef.current = 0;
          gainRef.current.reset();
        }

        const buffer = bufferRef.current;
        for (const value of samples) {
          if (typeof value !== "number" || !Number.isFinite(value)) continue;
          buffer[headRef.current] = value;
          headRef.current = (headRef.current + 1) % buffer.length;
          if (filledRef.current < buffer.length) filledRef.current++;
        }
        dirtyRef.current = true;
      },
      [windowSeconds],
    );

    const clearStrip = useCallback(() => {
      headRef.current = 0;
      filledRef.current = 0;
      gainRef.current.reset();
      dirtyRef.current = true;
    }, []);

    // Controlled mode: dedupe replays (effects run twice under React Strict
    // Mode in development) and reset the strip when a new session begins.
    const lastAppendedRef = useRef<string | null>(null);
    const sessionIdRef = useRef<string | null>(null);

    useEffect(() => {
      if (!chunk) return;
      const key = `${chunk.sessionId}:${chunk.sequence}`;
      if (lastAppendedRef.current === key) return;
      lastAppendedRef.current = key;

      if (sessionIdRef.current !== chunk.sessionId) {
        sessionIdRef.current = chunk.sessionId;
        clearStrip();
      }
      appendChunk(chunk.samples, chunk.sampleRate);
    }, [chunk, appendChunk, clearStrip]);

    useImperativeHandle(
      ref,
      () => ({
        pushChunk: appendChunk,
        reset: clearStrip,
      }),
      [appendChunk, clearStrip],
    );

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      let raf = 0;
      let lastW = 0;
      let lastH = 0;

      const draw = () => {
        raf = requestAnimationFrame(draw);

        if (document.hidden) return;

        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        if (w === 0 || h === 0) return;

        const dpr = window.devicePixelRatio || 1;
        const sizeChanged =
          w !== lastW ||
          h !== lastH ||
          canvas.width !== Math.round(w * dpr) ||
          canvas.height !== Math.round(h * dpr);
        if (!dirtyRef.current && !sizeChanged) return;
        dirtyRef.current = false;
        lastW = w;
        lastH = h;

        if (sizeChanged) {
          canvas.width = Math.round(w * dpr);
          canvas.height = Math.round(h * dpr);
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        drawGrid(ctx, w, h);

        const buffer = bufferRef.current;
        const filled = filledRef.current;
        if (!buffer.length || filled === 0) return;

        // The oldest live sample sits at `oldest`; `filled - 1` is the newest.
        const oldest = filled === buffer.length ? headRef.current : 0;
        const at = (i: number) => buffer[(oldest + i) % buffer.length];

        let min = Infinity;
        let max = -Infinity;
        for (let i = 0; i < filled; i++) {
          const v = at(i);
          if (v < min) min = v;
          if (v > max) max = v;
        }
        gainRef.current.update(min, max);

        const gain = gainRef.current;
        const amplitude = (h * 0.35) / (gain.span / 2);
        const toY = (v: number) => h / 2 - (v - gain.center) * amplitude;

        const pxPerSample = w / (windowSeconds * rateRef.current);
        ctx.strokeStyle = TRACE;
        ctx.shadowColor = TRACE_GLOW;
        ctx.shadowBlur = 8;
        ctx.lineWidth = 1.6;
        ctx.lineJoin = "round";
        ctx.beginPath();

        if (pxPerSample >= 1) {
          // Sparse enough for a true polyline; newest sample at the right
          // edge, blank space on the left until the window fills.
          const startPx = w - filled * pxPerSample;
          for (let i = 0; i < filled; i++) {
            const x = startPx + i * pxPerSample;
            const y = toY(at(i));
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
        } else {
          // Dense: per-pixel min/max envelope. Logical sample i covers the
          // time slice ending (filled - 1 - i) samples before the newest, so
          // column px maps through distance-from-right / pxPerSample.
          for (let px = 0; px < w; px++) {
            const hi = filled - 1 - Math.floor((w - 1 - px) / pxPerSample);
            if (hi < 0) continue; // before the first sample — blank paper
            const lo = Math.max(0, filled - 1 - Math.floor((w - px) / pxPerSample));
            const a = Math.max(0, lo);
            const b = Math.min(filled - 1, hi);
            if (b < a) continue;

            let vLo = Infinity;
            let vHi = -Infinity;
            for (let i = a; i <= b; i++) {
              const v = at(i);
              if (v < vLo) vLo = v;
              if (v > vHi) vHi = v;
            }
            const yTop = toY(vHi);
            const yBottom = toY(vLo);
            ctx.moveTo(px + 0.5, yTop);
            ctx.lineTo(px + 0.5, Math.max(yBottom, yTop + 0.8));
          }
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
      };

      raf = requestAnimationFrame(draw);
      return () => cancelAnimationFrame(raf);
    }, [windowSeconds]);

    return (
      <div className={`relative overflow-hidden rounded-xl border border-white/10 bg-[#0b1220] ${className}`}>
        <canvas ref={canvasRef} className="block h-full w-full" />

        <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2">
          {state === "live" ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/15 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-red-400 ring-1 ring-red-400/30">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
              Live
            </span>
          ) : state === "ended" ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-white/70 ring-1 ring-white/20">
              Ended
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-white/60 ring-1 ring-white/20">
              Standby
            </span>
          )}
        </div>

        <div className="pointer-events-none absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-xs font-bold text-white ring-1 ring-white/20">
          <HeartPulse className="h-3.5 w-3.5 text-red-400" />
          {heartRate != null ? `${Math.round(heartRate)} BPM` : "-- BPM"}
        </div>
      </div>
    );
  },
);

// ── Historical trace ───────────────────────────────────────────────────────

interface EcgStaticTraceProps {
  samples: number[];
  sampleRate: number;
  className?: string;
}

/**
 * Renders a stored session. Long recordings are far larger than the canvas,
 * so each pixel column shows the min/max envelope of its samples — the same
 * convention medical export tools use, and the only way a 30-minute session
 * keeps its R-spikes visible at screen width.
 */
export function EcgStaticTrace({ samples, sampleRate, className = "" }: EcgStaticTraceProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const render = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w === 0 || h === 0 || samples.length === 0) return;

      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      drawGrid(ctx, w, h);

      let min = Infinity;
      let max = -Infinity;
      for (const v of samples) {
        if (v < min) min = v;
        if (v > max) max = v;
      }
      const span = Math.max(max - min, MIN_SPAN);
      const mid = (min + max) / 2;
      const amplitude = (h * 0.35) / (span / 2);
      const toY = (v: number) => h / 2 - (v - mid) * amplitude;

      ctx.strokeStyle = TRACE;
      ctx.shadowColor = TRACE_GLOW;
      ctx.shadowBlur = 6;
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (samples.length >= w) {
        for (let px = 0; px < w; px++) {
          const i0 = Math.floor((px * samples.length) / w);
          const i1 = Math.max(i0 + 1, Math.floor(((px + 1) * samples.length) / w));
          let lo = Infinity;
          let hi = -Infinity;
          for (let i = i0; i < i1 && i < samples.length; i++) {
            const v = samples[i];
            if (v < lo) lo = v;
            if (v > hi) hi = v;
          }
          const yTop = toY(hi);
          const yBottom = toY(lo);
          ctx.moveTo(px + 0.5, yTop);
          ctx.lineTo(px + 0.5, Math.max(yBottom, yTop + 0.8));
        }
        } else {
          const step = w / samples.length;
          for (let i = 0; i < samples.length; i++) {
            const x = i * step;
            const y = toY(samples[i]);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
      };

    render();
    const observer = new ResizeObserver(render);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [samples, sampleRate]);

  return (
    <div className={`overflow-hidden rounded-xl border border-white/10 bg-[#0b1220] ${className}`}>
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
}
