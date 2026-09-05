"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Activity, Heart } from "lucide-react";
import type { LiveEcgChunk, MeasurementType } from "../lib/types";
import { formatRelative, formatValue } from "../lib/format";
import { EcgMonitor } from "./user/ecg-monitor";

interface IcuMonitorProps {
  chunk: LiveEcgChunk | null;
  live: Partial<Record<MeasurementType, { value: number; unit: string; measuredAt: string }>>;
  hardwareId?: string | null;
  recording: boolean;
  emptyLabel: string;
}

type Reading = { value: number; unit: string; measuredAt: string } | undefined;

/**
 * A bedside monitor shows the time. Rendering it requires the client clock,
 * which the server cannot know, so it starts empty and fills in after mount —
 * printing a server-side time here would cause a hydration mismatch.
 *
 * The one-second tick also refreshes the "Xs ago" labels below, so a reading
 * that stops arriving visibly ages instead of sitting there looking current.
 */
function useMonitorClock(): string {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return now
    ? now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "--:--:--";
}

function VitalReadout({
  label,
  type,
  reading,
  fallbackUnit,
  tone,
  children,
}: {
  label: string;
  type: MeasurementType;
  reading: Reading;
  fallbackUnit: string;
  tone: { border: string; text: string };
  children?: ReactNode;
}) {
  return (
    <div className={`flex flex-col justify-center rounded-xl border ${tone.border} bg-[#111827]/90 p-2`}>
      <span className={`flex items-center justify-between text-[10px] font-bold ${tone.text}`}>
        <span>{label}</span>
        {children}
      </span>
      <div className={`text-2xl font-bold tracking-tight ${tone.text}`}>
        {reading ? formatValue(type, reading.value) : "—"}
      </div>
      <span className="truncate text-[9px] text-white/50">
        {reading ? `${reading.unit || fallbackUnit} · ${formatRelative(reading.measuredAt)}` : fallbackUnit}
      </span>
    </div>
  );
}

export function IcuMonitor({ chunk, live, hardwareId, recording, emptyLabel }: IcuMonitorProps) {
  const hr = live.HEART_RATE;
  const spo2 = live.SPO2;
  const temperature = live.TEMPERATURE;
  const clock = useMonitorClock();

  return (
    <div className="relative flex h-full min-h-[240px] w-full flex-col overflow-hidden rounded-2xl border-2 border-[#1e293b] bg-[#080c10] p-3 font-mono shadow-[inset_0_0_20px_rgba(0,0,0,0.8)]">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-[#111827] px-3 py-1.5 text-xs">
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={`flex items-center gap-1 font-bold ${recording ? "animate-pulse text-red-500" : "text-white/50"}`}
          >
            <span className={`h-2 w-2 rounded-full ${recording ? "bg-red-500" : "bg-white/30"}`} />
            {recording ? "LIVE ECG" : "STANDBY"}
          </span>
          <span className="text-white/45">|</span>
          <span className="text-white/80">{hardwareId ?? "UNPAIRED"}</span>
          <span className="text-white/45">|</span>
          <span className="font-bold text-green-400">ECG LEAD II</span>
        </div>
        <div className="flex items-center gap-2 text-cyan-400">
          <span>25 mm/s</span>
          <span className="text-white/45">|</span>
          <span className="tabular-nums">{clock}</span>
        </div>
      </div>

      <div className="relative grid flex-1 grid-cols-12 gap-2">
        <div className="relative col-span-9 min-h-[180px] rounded-xl border border-white/5 bg-black/40 p-1">
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#00ff6610_1px,transparent_1px),linear-gradient(to_bottom,#00ff6610_1px,transparent_1px)] bg-[size:20px_20px]" />
          <div className="absolute top-1 left-2 z-10 flex items-center gap-1 text-[10px] font-bold text-[#00ff66]">
            <Activity size={12} /> II
          </div>
          <div className="relative h-full min-h-[180px]">
            {recording ? (
              <EcgMonitor chunk={chunk} state="live" className="h-full w-full" />
            ) : (
              <p className="absolute inset-0 grid place-items-center px-6 text-center text-xs text-white/40">
                {emptyLabel}
              </p>
            )}
          </div>
        </div>

        <div className="col-span-3 flex flex-col justify-between gap-1">
          <VitalReadout
            label="HR"
            type="HEART_RATE"
            reading={hr}
            fallbackUnit="bpm"
            tone={{ border: "border-[#00ff66]/30", text: "text-[#00ff66]" }}
          >
            {/* Only beat when a reading is actually arriving — a pulsing heart
                over a dash implies a signal that isn't there. */}
            <Heart size={10} className={hr ? "animate-ping text-[#00ff66]" : "text-[#00ff66]/30"} />
          </VitalReadout>

          <VitalReadout
            label="SpO2"
            type="SPO2"
            reading={spo2}
            fallbackUnit="%"
            tone={{ border: "border-cyan-500/30", text: "text-cyan-400" }}
          />

          {/* The reference kiosk showed a fourth NIBP channel, but this device
              has no cuff. Temperature is the third vital it genuinely reports. */}
          <VitalReadout
            label="TEMP"
            type="TEMPERATURE"
            reading={temperature}
            fallbackUnit="°C"
            tone={{ border: "border-orange-500/30", text: "text-orange-400" }}
          />
        </div>
      </div>
    </div>
  );
}
