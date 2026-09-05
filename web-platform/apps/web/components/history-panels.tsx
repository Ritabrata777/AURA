"use client";

import type { EcgSessionSummary, Measurement } from "../lib/types";
import {
  VITAL_LABELS,
  formatDateTime,
  formatDuration,
  formatValue,
} from "../lib/format";
import { glassPanel, InnerGlow } from "./kiosk";

export function MeasurementHistory({ measurements }: { measurements: Measurement[] }) {
  return (
    <article className={`${glassPanel} p-6`} id="history">
      <InnerGlow />
      <div className="mb-4">
        <p className="text-[11px] font-bold tracking-wider text-white/50 uppercase">Recent activity</p>
        <h2 className="text-lg font-bold">Measurement history</h2>
      </div>

      {measurements.length === 0 ? (
        <p className="text-sm text-white/50">Nothing recorded yet. Trigger a reading from your device above.</p>
      ) : (
        measurements.map((measurement) => (
          <div
            className="flex items-center gap-3 border-b border-white/10 py-3 last:border-0"
            key={measurement.id}
          >
            <div className="min-w-0 flex-1">
              <strong className="block text-sm">{VITAL_LABELS[measurement.type]}</strong>
              <small className="text-[11px] text-white/50">
                {formatDateTime(measurement.measuredAt)}
                {measurement.quality !== "VALID" ? ` · ${measurement.quality.toLowerCase()}` : ""}
              </small>
            </div>
            <b className={`font-semibold ${measurement.quality === "VALID" ? "" : "text-white/40"}`}>
              {formatValue(measurement.type, measurement.value)}{" "}
              <small className="font-normal text-white/50">{measurement.unit}</small>
            </b>
          </div>
        ))
      )}
    </article>
  );
}

export function EcgSessionList({
  sessions,
  onSelect,
  selectedId,
}: {
  sessions: EcgSessionSummary[];
  onSelect: (sessionId: string) => void;
  selectedId: string | null;
}) {
  return (
    <article className={`${glassPanel} p-6`}>
      <InnerGlow />
      <div className="mb-4">
        <p className="text-[11px] font-bold tracking-wider text-white/50 uppercase">Recordings</p>
        <h2 className="text-lg font-bold">ECG sessions</h2>
      </div>

      {sessions.length === 0 ? (
        <p className="text-sm text-white/50">No ECG recordings yet.</p>
      ) : (
        sessions.map((session) => (
          <button
            className={`flex w-full items-center gap-3 border-b border-white/10 px-2 py-3 text-left last:border-0 ${
              selectedId === session.id ? "rounded-xl bg-white/10" : "hover:bg-white/5"
            }`}
            key={session.id}
            onClick={() => onSelect(session.id)}
          >
            <div className="min-w-0 flex-1">
              <strong className="block text-sm">{formatDateTime(session.startedAt)}</strong>
              <small className="text-[11px] text-white/50">
                {session.hardwareId} · {session.sampleRate} Hz · {session.chunkCount} chunks
              </small>
            </div>
            <b className="shrink-0 text-sm">
              {session.inProgress ? (
                <span className="rounded-full border border-green-500/30 bg-green-500/10 px-2 py-1 text-[11px] text-green-400">
                  Recording
                </span>
              ) : (
                formatDuration(session.durationSeconds)
              )}
            </b>
          </button>
        ))
      )}
    </article>
  );
}
