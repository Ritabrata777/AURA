"use client";

import { useState } from "react";
import { MeasurementHistory, EcgSessionList } from "@/components/history-panels";
import { EcgSessionDetail } from "@/components/ecg-session-detail";
import { TrendChart } from "@/components/trend-chart";
import { LoadingState } from "@/components/ui/LoadingState";
import { useClinicPatient } from "@/components/clinic/patient-provider";
import { glassPanel, InnerGlow } from "@/components/kiosk";
import { VITAL_LABELS } from "@/lib/format";
import type { MeasurementType } from "@/lib/types";

export default function ClinicPatientVitals() {
  const {
    loading,
    measurements,
    sessions,
    trend,
    trendType,
    setTrendType,
  } = useClinicPatient();
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  if (loading) {
    return <LoadingState message="Loading your vitals history…" />;
  }

  return (
    <>
      <h1 className="text-2xl font-bold text-white">Vitals history</h1>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <MeasurementHistory measurements={measurements} />
        <article className={`${glassPanel} p-6`}>
          <InnerGlow />
          <div className="relative mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-white/50">
                Last 30 days
              </p>
              <h2 className="text-lg font-bold">{VITAL_LABELS[trendType]} trend</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {(["HEART_RATE", "SPO2", "TEMPERATURE"] as MeasurementType[]).map((type) => (
                <button
                  key={type}
                  className={`rounded-xl border px-3 py-1.5 text-xs font-bold ${
                    trendType === type
                      ? "border-green-500/40 bg-green-500/15 text-green-400"
                      : "border-white/15 bg-white/5 text-white/60"
                  }`}
                  onClick={() => setTrendType(type)}
                >
                  {VITAL_LABELS[type]}
                </button>
              ))}
            </div>
          </div>
          <div className="relative">
            <TrendChart points={trend} type={trendType} />
          </div>
        </article>
      </section>

      <EcgSessionList
        sessions={sessions}
        selectedId={selectedSessionId}
        onSelect={setSelectedSessionId}
      />

      {selectedSessionId ? (
        <EcgSessionDetail
          sessionId={selectedSessionId}
          onClose={() => setSelectedSessionId(null)}
        />
      ) : null}
    </>
  );
}
