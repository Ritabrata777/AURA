"use client";

import { Heart, Activity, Thermometer } from "lucide-react";
import { glassCard, InnerGlow } from "../kiosk";
import type { MeasurementType, LatestReading } from "@/lib/types";

interface VitalCardProps {
  type: MeasurementType;
  latest: LatestReading | null;
  baseline?: {
    average: number;
    min: number | null;
    max: number | null;
  } | null;
  deviation?: number | null;
}

const icons: Record<MeasurementType, typeof Heart> = {
  HEART_RATE: Heart,
  SPO2: Activity,
  TEMPERATURE: Thermometer,
};

const labels: Record<MeasurementType, string> = {
  HEART_RATE: "Heart Rate",
  SPO2: "Blood Oxygen",
  TEMPERATURE: "Temperature",
};

const colors: Record<MeasurementType, string> = {
  HEART_RATE: "text-red-400",
  SPO2: "text-teal-300",
  TEMPERATURE: "text-orange-300",
};

export function VitalCard({ type, latest, baseline, deviation }: VitalCardProps) {
  const Icon = icons[type];
  const label = labels[type];
  const color = colors[type];

  return (
    <div className={`${glassCard} p-5 transition-colors hover:bg-white/10`}>
      <InnerGlow />
      <div className="relative flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-white/60">{label}</h3>
        <Icon className={`h-5 w-5 ${color}`} />
      </div>

      {latest ? (
        <>
          <div className="relative mb-2">
            <span className="text-3xl font-bold text-white">
              {latest.value.toFixed(type === "TEMPERATURE" ? 1 : 0)}
            </span>
            <span className="ml-2 text-sm text-white/50">{latest.unit}</span>
          </div>

          <div className="relative flex items-center justify-between text-xs">
            <span className="text-white/40">
              {new Date(latest.measuredAt).toLocaleTimeString()}
            </span>
            {latest.quality === "VALID" && (
              <span className="font-medium text-emerald-400">Valid</span>
            )}
            {latest.quality === "INVALID" && (
              <span className="font-medium text-amber-300">Check sensor</span>
            )}
            {latest.quality === "UNAVAILABLE" && (
              <span className="text-white/40">Unavailable</span>
            )}
          </div>

          {baseline && deviation !== null && deviation !== undefined && (
            <div className="relative mt-3 pt-3 border-t border-white/10">
              <div className="text-xs text-white/50">
                Baseline: {baseline.average.toFixed(type === "TEMPERATURE" ? 1 : 0)} {latest.unit}
              </div>
              {deviation > 10 && (
                <div className="text-xs font-medium text-orange-300 mt-1">
                  +{deviation.toFixed(0)}% above your usual
                </div>
              )}
              {deviation < -10 && (
                <div className="text-xs font-medium text-teal-200 mt-1">
                  {deviation.toFixed(0)}% below your usual
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="relative text-white/30 text-sm">No data</div>
      )}
    </div>
  );
}
