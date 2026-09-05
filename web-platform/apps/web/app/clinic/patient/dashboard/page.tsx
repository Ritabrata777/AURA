"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Activity, CheckCircle2, Droplets, Sparkles, Thermometer, X } from "lucide-react";
import { VitalsCards } from "@/components/vitals-cards";
import { IcuMonitor } from "@/components/icu-monitor";
import { LoadingState } from "@/components/ui/LoadingState";
import { useClinicPatient } from "@/components/clinic/patient-provider";
import { glassPanel, InnerGlow } from "@/components/kiosk";

const tests = [
  { id: "ecg", name: "ECG Test", icon: <Activity size={28} />, color: "text-green-400", border: "border-green-500/40" },
  { id: "spo2", name: "SpO2 & Pulse", icon: <Droplets size={28} />, color: "text-cyan-400", border: "border-cyan-500/40" },
  { id: "temp", name: "Body Temp", icon: <Thermometer size={28} />, color: "text-orange-400", border: "border-orange-500/40" },
];

export default function ClinicPatientDashboard() {
  const {
    loading,
    summaries,
    liveVitals,
    ecgChunk,
    activeSession,
    activeTest,
    setActiveTest,
    primaryDevice,
    primaryOnline,
    runTest,
    sendCommand,
  } = useClinicPatient();

  if (loading) {
    return <LoadingState message="Loading your dashboard…" />;
  }

  return (
    <>
      <section id="vitals" className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold text-white">Your vitals</h1>
        <VitalsCards summaries={summaries} live={liveVitals} />
      </section>

      <div id="diagnostics" className={`${glassPanel} flex flex-col gap-4 p-6`}>
        <InnerGlow />
        <div>
          <h2 className="mb-1 text-lg font-bold">Run a diagnostic</h2>
          <p className="mb-6 text-xs text-white/50">
            Start a reading on your paired device — results stream below and save to your history.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {tests.map((test) => {
              const isActive =
                activeTest === test.id || (test.id === "ecg" && Boolean(activeSession));
              return (
                <button
                  type="button"
                  key={test.id}
                  onClick={() => runTest(test.id)}
                  className={`group relative flex h-36 cursor-pointer flex-col justify-between rounded-2xl border bg-white/5 p-5 text-left transition-all hover:bg-white/10 ${test.border} ${
                    isActive ? "bg-white/10 ring-2 ring-violet-500" : ""
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className={test.color}>{test.icon}</div>
                    <CheckCircle2
                      size={16}
                      className={isActive ? "text-violet-400" : "text-white/20"}
                    />
                  </div>
                  <div>
                    <span className="block text-sm font-bold">{test.name}</span>
                    <span className="text-[10px] uppercase tracking-wider text-white/40">
                      {isActive ? "Streaming Live" : "Ready to Stream"}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <AnimatePresence>
          {(activeTest === "ecg" || activeSession) && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 320 }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-4 flex shrink-0 flex-col gap-2 overflow-hidden"
            >
              <div className="flex items-center justify-between text-xs">
                <span
                  className={`flex items-center gap-2 font-bold ${
                    ecgChunk || activeSession ? "text-green-400" : "text-white/50"
                  }`}
                >
                  <span
                    className={`h-2 w-2 rounded-full ${
                      ecgChunk || activeSession ? "animate-pulse bg-green-500" : "bg-white/30"
                    }`}
                  />
                  {ecgChunk || activeSession ? "LIVE TELEMETRY STREAMING" : "WAITING FOR TELEMETRY…"}
                </span>
                <button
                  onClick={() => {
                    setActiveTest(null);
                    if (primaryDevice && activeSession) {
                      void sendCommand(primaryDevice.deviceId, "STOP_ECG");
                    }
                  }}
                  className="flex items-center gap-1 text-[11px] text-white/40 hover:text-white"
                >
                  <X size={14} /> Close Monitor
                </button>
              </div>
              <div className="h-[280px] w-full overflow-hidden rounded-2xl border border-green-500/30">
                <IcuMonitor
                  chunk={ecgChunk}
                  live={liveVitals}
                  hardwareId={primaryDevice?.hardwareId}
                  recording={Boolean(activeSession)}
                  emptyLabel="Start an ECG recording to see the waveform here."
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-2 flex items-center gap-3 rounded-2xl border border-white/10 bg-black/30 p-4">
          <Sparkles className="shrink-0 text-yellow-400" size={20} />
          <p className="text-xs text-white/70">
            Ensure physical probes are connected firmly before starting diagnostic tests.
          </p>
        </div>
      </div>
    </>
  );
}
