"use client";

import { Heart, Thermometer, Droplets, TrendingUp } from "lucide-react";
import type { MeasurementType, VitalSummary } from "../lib/types";
import {
  VITAL_LABELS,
  describeDeviation,
  formatRelative,
  formatValue,
} from "../lib/format";
import { glassPanel, InnerGlow } from "./kiosk";

interface VitalsCardsProps {
  summaries: VitalSummary[];
  live: Partial<Record<MeasurementType, { value: number; unit: string; measuredAt: string }>>;
}

const ICONS: Record<MeasurementType, typeof Heart> = {
  HEART_RATE: Heart,
  SPO2: Droplets,
  TEMPERATURE: Thermometer,
};

const BADGE: Record<string, string> = {
  steady: "border-green-500/30 bg-green-500/10 text-green-400",
  up: "border-red-500/50 bg-red-500/20 text-red-400",
  down: "border-cyan-500/40 bg-cyan-500/10 text-cyan-400",
  unknown: "border-white/20 bg-white/5 text-white/50",
};

export function VitalsCards({ summaries, live }: VitalsCardsProps) {
  return (
    <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" id="overview">
      {summaries.map((summary) => {
        const liveReading = live[summary.type];
        const latest = liveReading ?? summary.latest;
        const Icon = ICONS[summary.type];

        const average = summary.baseline?.average ?? null;
        const deviation =
          latest && average !== null && average !== 0
            ? Math.round(((latest.value - average) / average) * 1000) / 10
            : summary.deviationFromBaseline;

        const status = describeDeviation(deviation);

        return (
          <article className={`${glassPanel} flex flex-col justify-between p-4`} key={summary.type}>
            <InnerGlow />
            <h3 className="flex items-center gap-2 text-xs font-medium tracking-wider text-white/60 uppercase">
              <Icon size={14} />
              {VITAL_LABELS[summary.type]}
            </h3>

            {latest ? (
              <div className="mt-1">
                <span className="text-4xl font-semibold tracking-tight drop-shadow-md">
                  {formatValue(summary.type, latest.value)}
                </span>
                <span className="ml-1 text-sm text-white/60">{latest.unit}</span>
              </div>
            ) : (
              <div className="mt-1 text-white/40">
                <span className="text-4xl font-semibold">—</span>
                <span className="ml-1 text-sm">no data</span>
              </div>
            )}

            <div className="mt-2 flex items-end justify-between">
              <span
                className={`rounded border px-2 py-1 text-[10px] font-bold tracking-widest uppercase ${BADGE[status.tone]}`}
              >
                {status.text}
              </span>
              {liveReading ? (
                <span className="flex items-center gap-1 text-xs text-white/80">
                  live <TrendingUp size={12} className="text-green-400" />
                </span>
              ) : (
                <span className="text-xs text-white/50">
                  {latest ? formatRelative(latest.measuredAt) : "Waiting"}
                </span>
              )}
            </div>
          </article>
        );
      })}
    </section>
  );
}
