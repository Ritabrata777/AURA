"use client";

import { Heart, Activity, Thermometer } from "lucide-react";
import { glassCard } from "../kiosk";
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
  PIEZO_HEART_RATE: Heart,
  MAX30102_HEART_RATE: Heart,
  SPO2: Activity,
  TEMPERATURE: Thermometer,
};

const labels: Record<MeasurementType, string> = {
  HEART_RATE: "Heart Rate",
  PIEZO_HEART_RATE: "Piezo Heart Rate",
  MAX30102_HEART_RATE: "MAX30102 Heart Rate",
  SPO2: "Blood Oxygen",
  TEMPERATURE: "Temperature",
};

const colors: Record<MeasurementType, string> = {
  HEART_RATE: "text-red-400",
  PIEZO_HEART_RATE: "text-pink-400",
  MAX30102_HEART_RATE: "text-rose-400",
  SPO2: "text-teal-300",
  TEMPERATURE: "text-orange-300",
};

const bgGradients: Record<MeasurementType, string> = {
  HEART_RATE: "from-red-500/10 to-pink-500/5",
  PIEZO_HEART_RATE: "from-pink-500/10 to-fuchsia-500/5",
  MAX30102_HEART_RATE: "from-rose-500/10 to-red-500/5",
  SPO2: "from-teal-500/10 to-cyan-500/5",
  TEMPERATURE: "from-orange-500/10 to-amber-500/5",
};

export function VitalCard({ type, latest, baseline, deviation }: VitalCardProps) {
  const Icon = icons[type];
  const label = labels[type];
  const color = colors[type];
  const bgGradient = bgGradients[type];

  return (
    <div className={`${glassCard} group relative overflow-hidden rounded-2xl p-5 transition-all duration-300 hover:shadow-[0_0_30px_rgba(139,92,246,0.15)] hover:ring-1 hover:ring-white/20`}>
      {/* Background gradient layer */}
      <div className={`absolute inset-0 bg-gradient-to-br ${bgGradient} opacity-30 transition-opacity group-hover:opacity-40`} />
      
      {/* Inner glow - moved to top but behind content */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-transparent opacity-50" />
      
      {/* Content - positioned relative to sit above backgrounds */}
      <div className="relative">
        {/* Header with icon */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-white/70">{label}</h3>
          <div className={`flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 ring-1 ring-white/10 ${color}`}>
            <Icon className="h-4 w-4" />
          </div>
        </div>

        {latest ? (
          <>
            {/* Main value */}
            <div className="mb-3">
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-bold text-white tracking-tight">
                  {latest.value.toFixed(type === "TEMPERATURE" ? 1 : 0)}
                </span>
                <span className="text-xs font-medium text-white/50">{latest.unit}</span>
              </div>
            </div>

            {/* Timestamp and quality */}
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-white/40">
                {new Date(latest.measuredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
              {latest.quality === "VALID" && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-300 ring-1 ring-emerald-400/20">
                  <span className="h-1 w-1 rounded-full bg-emerald-400" />
                  Valid
                </span>
              )}
              {latest.quality === "INVALID" && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-300 ring-1 ring-amber-400/20">
                  <span className="h-1 w-1 rounded-full bg-amber-400" />
                  Check
                </span>
              )}
            </div>

            {/* Baseline and deviation */}
            {baseline && deviation !== null && deviation !== undefined && (
              <div className="rounded-lg bg-white/5 p-2.5 ring-1 ring-white/10">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-white/50">Baseline</span>
                  <span className="font-medium text-white/80">
                    {baseline.average.toFixed(type === "TEMPERATURE" ? 1 : 0)} {latest.unit}
                  </span>
                </div>
                {Math.abs(deviation) > 5 && (
                  <div className={`mt-1.5 flex items-center gap-1 text-xs font-semibold ${
                    deviation > 0 ? "text-orange-300" : "text-teal-300"
                  }`}>
                    {deviation > 0 ? (
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m18 15-6-6-6 6"/>
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m6 9 6 6 6-6"/>
                      </svg>
                    )}
                    {Math.abs(deviation).toFixed(0)}% from baseline
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="flex h-20 items-center justify-center">
            <div className="text-center">
              <p className="text-white/30 text-sm">No data available</p>
              <p className="text-white/20 text-xs mt-0.5">Waiting for device</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
