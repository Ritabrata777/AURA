"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { HeartPulse } from "lucide-react";
import type { LiveEcgChunk } from "../../lib/types";

/**
 * Real-signal ECG rendering.
 *
 * Samples arrive from the device over Socket.IO (`ecg:chunk`, 50-sample
 * batches at 250 Hz) and are drawn exactly as received from the firmware ECG
 * pipeline. Nothing here synthesizes or fakes a waveform.
 */

const PAPER = "#0b1220";
const GRID_MINOR = "#1a2740";
const GRID_MAJOR = "#2b3d5f";
const TRACE = "#34d399";
const TRACE_GLOW = "rgba(52, 211, 153, 0.55)";
const MIN_SPAN = 90;
const MAX_SPAN = 2200;
const GAIN_ALPHA = 0.035;
const ROBUST_LOW_PERCENTILE = 0.02;
const ROBUST_HIGH_PERCENTILE = 0.98;
const WINDOW_OPTIONS = [3, 5, 10] as const;
const TARGET_FRAME_MS = 33;

function drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number, seconds?: number) {
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, w, h);

  ctx.lineWidth = 1;
  const xMinor = seconds ? w / (seconds * 5) : 12;
  const xMajor = seconds ? w / seconds : 60;

  for (const [xStep, yStep, color] of [
    [xMinor, 12, GRID_MINOR],
    [xMajor, 60, GRID_MAJOR],
  ] as const) {
    ctx.strokeStyle = color;
    ctx.beginPath();
    for (let x = xStep; x < w; x += xStep) {
      const crispX = Math.round(x) + 0.5;
      ctx.moveTo(crispX, 0);
      ctx.lineTo(crispX, h);
    }
    for (let y = yStep; y < h; y += yStep) {
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(w, y + 0.5);
    }
    ctx.stroke();
  }
}

function drawTimeAxis(ctx: CanvasRenderingContext2D, w: number, h: number, seconds: number) {
  const axisY = h - 20;

  ctx.strokeStyle = "rgba(148, 163, 184, 0.28)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, axisY + 0.5);
  ctx.lineTo(w, axisY + 0.5);

  for (let second = 0; second <= seconds; second++) {
    const x = (second / seconds) * w;
    ctx.moveTo(Math.round(x) + 0.5, axisY - 4);
    ctx.lineTo(Math.round(x) + 0.5, axisY + 4);
  }
  ctx.stroke();

  ctx.fillStyle = "rgba(226, 232, 240, 0.58)";
  ctx.font = "11px ui-sans-serif, system-ui, sans-serif";
  ctx.textBaseline = "top";
  for (let second = 0; second <= seconds; second++) {
    const x = (second / seconds) * w;
    ctx.textAlign = second === 0 ? "left" : second === seconds ? "right" : "center";
    ctx.fillText(`${second}s`, second === 0 ? 6 : second === seconds ? w - 6 : x, axisY + 7);
  }
}

class Gain {
  center = 0;
  span = MIN_SPAN;
  private seen = false;

  update(min: number, max: number) {
    const targetCenter = (min + max) / 2;
    const targetSpan = Math.min(Math.max(max - min, MIN_SPAN), MAX_SPAN);
    if (!this.seen) {
      this.center = targetCenter;
      this.span = targetSpan;
      this.seen = true;
      return;
    }
    this.center += (targetCenter - this.center) * GAIN_ALPHA;
    this.span += (targetSpan - this.span) * GAIN_ALPHA;
  }

  reset() {
    this.seen = false;
    this.center = 0;
    this.span = MIN_SPAN;
  }
}

function robustRange(sampleAt: (index: number) => number, count: number) {
  const values = new Array<number>(count);
  for (let i = 0; i < count; i++) {
    values[i] = sampleAt(i);
  }
  values.sort((a, b) => a - b);

  const lowIndex = Math.max(0, Math.min(count - 1, Math.floor((count - 1) * ROBUST_LOW_PERCENTILE)));
  const highIndex = Math.max(0, Math.min(count - 1, Math.ceil((count - 1) * ROBUST_HIGH_PERCENTILE)));
  return {
    low: values[lowIndex],
    high: values[highIndex],
  };
}

export interface EcgMonitorHandle {
  pushChunk: (samples: number[], sampleRate: number) => void;
  reset: () => void;
}

interface EcgMonitorProps {
  state: "idle" | "live" | "ended";
  heartRate?: number | null;
  windowSeconds?: number;
  chunk?: LiveEcgChunk | null;
  className?: string;
}

export const EcgMonitor = forwardRef<EcgMonitorHandle, EcgMonitorProps>(
  function EcgMonitor({ state, heartRate, windowSeconds = 5, chunk, className = "" }, ref) {
    const [displayWindow, setDisplayWindow] = useState(windowSeconds);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const bufferRef = useRef<Float32Array>(new Float32Array(0));
    const headRef = useRef(0);
    const filledRef = useRef(0);
    const rateRef = useRef(125);
    const gainRef = useRef(new Gain());
    const dirtyRef = useRef(true);
    const lastDebugAtRef = useRef(0);

    const appendChunk = useCallback(
      (samples: number[], sampleRate: number) => {
        if (!samples.length || sampleRate <= 0) return;
        rateRef.current = sampleRate;

        const capacity = Math.max(1, Math.round(displayWindow * sampleRate));
        if (bufferRef.current.length !== capacity) {
          bufferRef.current = new Float32Array(capacity);
          headRef.current = 0;
          filledRef.current = 0;
          gainRef.current.reset();
        }

        const buffer = bufferRef.current;
        let chunkMin = Infinity;
        let chunkMax = -Infinity;
        let chunkSum = 0;
        let chunkCount = 0;
        for (const value of samples) {
          if (typeof value !== "number" || !Number.isFinite(value)) continue;
          buffer[headRef.current] = value;
          headRef.current = (headRef.current + 1) % buffer.length;
          if (filledRef.current < buffer.length) filledRef.current++;
          if (value < chunkMin) chunkMin = value;
          if (value > chunkMax) chunkMax = value;
          chunkSum += value;
          chunkCount++;
        }

        const now = Date.now();
        if (chunkCount > 0 && now - lastDebugAtRef.current >= 5000) {
          lastDebugAtRef.current = now;
          console.debug("ECG samples", {
            sampleRate,
            count: chunkCount,
            min: Math.round(chunkMin),
            max: Math.round(chunkMax),
            mean: Math.round(chunkSum / chunkCount),
            peakToPeak: Math.round(chunkMax - chunkMin),
          });
        }
        dirtyRef.current = true;
      },
      [displayWindow],
    );

    const clearStrip = useCallback(() => {
      headRef.current = 0;
      filledRef.current = 0;
      gainRef.current.reset();
      dirtyRef.current = true;
    }, []);

    const lastAppendedRef = useRef<string | null>(null);
    const sessionIdRef = useRef<string | null>(null);
    const lastSequenceRef = useRef<number | null>(null);

    useEffect(() => {
      if (!chunk) return;
      const key = `${chunk.sessionId}:${chunk.sequence}`;
      if (lastAppendedRef.current === key) return;
      lastAppendedRef.current = key;

      if (sessionIdRef.current !== chunk.sessionId) {
        sessionIdRef.current = chunk.sessionId;
        lastSequenceRef.current = null;
        clearStrip();
      }

      if (lastSequenceRef.current !== null && chunk.sequence !== lastSequenceRef.current + 1) {
        console.warn("ECG chunk gap", {
          expected: lastSequenceRef.current + 1,
          received: chunk.sequence,
          sessionId: chunk.sessionId,
        });
      }
      lastSequenceRef.current = chunk.sequence;
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
      setDisplayWindow(windowSeconds);
    }, [windowSeconds]);

    useEffect(() => {
      dirtyRef.current = true;
    }, [displayWindow]);

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      let raf = 0;
      let lastW = 0;
      let lastH = 0;
      let lastDrawTime = 0;

      const draw = (now: number) => {
        raf = requestAnimationFrame(draw);

        if (document.hidden) return;
        if (now - lastDrawTime < TARGET_FRAME_MS) return;

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
        lastDrawTime = now;
        lastW = w;
        lastH = h;

        if (sizeChanged) {
          canvas.width = Math.round(w * dpr);
          canvas.height = Math.round(h * dpr);
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        drawGrid(ctx, w, h, displayWindow);

        const buffer = bufferRef.current;
        const filled = filledRef.current;
        if (!buffer.length || filled === 0) {
          drawTimeAxis(ctx, w, h, displayWindow);
          return;
        }

        const oldest = filled === buffer.length ? headRef.current : 0;
        const at = (i: number) => buffer[(oldest + i) % buffer.length];

        const range = robustRange(at, filled);
        gainRef.current.update(range.low, range.high);

        const gain = gainRef.current;
        const amplitude = (h * 0.35) / (gain.span / 2);
        const toY = (v: number) => h / 2 - (v - gain.center) * amplitude;

        const pxPerSample = w / (displayWindow * rateRef.current);
        ctx.strokeStyle = TRACE;
        ctx.shadowColor = TRACE_GLOW;
        ctx.shadowBlur = 8;
        ctx.lineWidth = 1.6;
        ctx.lineJoin = "round";
        ctx.beginPath();

        if (pxPerSample >= 0.5) {
          const startPx = w - filled * pxPerSample;
          for (let i = 0; i < filled; i++) {
            const x = startPx + i * pxPerSample;
            const y = toY(at(i));
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
        } else {
          for (let px = 0; px < w; px++) {
            const hi = filled - 1 - Math.floor((w - 1 - px) / pxPerSample);
            if (hi < 0) continue;
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

        ctx.fillStyle = "rgba(255, 255, 255, 0.46)";
        ctx.font = "11px ui-sans-serif, system-ui, sans-serif";
        ctx.textAlign = "right";
        ctx.fillText(`${displayWindow}s`, w - 10, 18);
        drawTimeAxis(ctx, w, h, displayWindow);
      };

      raf = requestAnimationFrame(draw);
      return () => cancelAnimationFrame(raf);
    }, [displayWindow]);

    const sampleRate = rateRef.current;
    const windowSampleCount = displayWindow * sampleRate;
    const statusLabel = state === "live" ? "LIVE" : state === "ended" ? "ENDED" : "STANDBY";

    return (
      <div className={`flex min-h-0 flex-col overflow-hidden rounded-lg border border-emerald-400/15 bg-[#071019] shadow-[0_0_28px_rgba(16,185,129,0.10)] ${className}`}>
        <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-emerald-400/10 bg-white/[0.025] px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className={`h-2 w-2 rounded-full ${
                state === "live"
                  ? "animate-pulse bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.85)]"
                  : state === "ended"
                    ? "bg-white/50"
                    : "bg-white/25"
              }`}
            />
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-300">
              {statusLabel}
            </span>
            <span className="text-xs font-semibold text-white/75">ECG (AD8232)</span>
          </div>

          <div className="ml-auto flex items-center gap-3">
            <div className="inline-flex items-center gap-1.5 text-xs font-bold text-white">
              <HeartPulse className="h-3.5 w-3.5 text-emerald-300" />
              {heartRate != null ? `${Math.round(heartRate)} BPM` : "-- BPM"}
            </div>
            <div className="inline-flex rounded-md border border-white/10 bg-black/20 p-0.5">
              {WINDOW_OPTIONS.map((seconds) => (
                <button
                  key={seconds}
                  type="button"
                  onClick={() => setDisplayWindow(seconds)}
                  className={`h-6 min-w-8 rounded px-2 text-[11px] font-semibold transition ${
                    displayWindow === seconds
                      ? "bg-emerald-400 text-slate-950"
                      : "text-white/55 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {seconds}s
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="relative min-h-0 flex-1">
          <canvas ref={canvasRef} className="block h-full w-full" />
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-t border-emerald-400/10 bg-white/[0.025] px-3 py-2 text-[11px] font-medium text-white/55">
          <span>Sample Rate: {sampleRate} Hz</span>
          <span className="text-white/20">|</span>
          <span>Samples: {windowSampleCount.toLocaleString()}</span>
          <span className="text-white/20">|</span>
          <span>Window: {displayWindow} s</span>
          <span className="ml-auto inline-flex items-center gap-1.5 text-emerald-300/80">
            <span className={`h-1.5 w-1.5 rounded-full ${state === "live" ? "bg-emerald-300" : "bg-white/25"}`} />
            {state === "live" ? "Streaming" : "Amplitude (a.u.)"}
          </span>
        </div>
      </div>
    );
  },
);

interface EcgStaticTraceProps {
  samples: number[];
  sampleRate: number;
  className?: string;
}

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
      const span = Math.min(Math.max(max - min, MIN_SPAN), MAX_SPAN);
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
