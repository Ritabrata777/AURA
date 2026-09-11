"use client";

import { useEffect, useState } from "react";
import { useApi } from "../lib/auth";
import { formatDateTime, formatDuration } from "../lib/format";
import { EcgStaticTrace } from "./user/ecg-monitor";

interface EcgSessionDetailPayload {
  id: string;
  hardwareId: string;
  sampleRate: number;
  startedAt: string;
  endedAt: string | null;
  inProgress: boolean;
  chunkCount: number;
  sampleCount: number;
  durationSeconds: number;
  samples: number[];
}

interface EcgSessionDetailProps {
  sessionId: string;
  /** Set for a doctor viewing a patient's recording; omitted for own data. */
  patientId?: string;
  /** Use the individual-user endpoint when the owner is viewing their own ECG. */
  individualUser?: boolean;
  onClose: () => void;
}

/**
 * Full recorded waveform for one session.
 *
 * A 5-minute recording at 250 Hz is 75,000 points — far more than a display
 * has pixels — so samples are decimated to roughly two per horizontal pixel,
 * keeping peaks visible without pushing an unreasonable path into the DOM.
 */
export function EcgSessionDetail({ sessionId, patientId, individualUser, onClose }: EcgSessionDetailProps) {
  const api = useApi();
  const [session, setSession] = useState<EcgSessionDetailPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const endpointScope = individualUser ? "individual" : patientId ?? "self";

  useEffect(() => {
    const controller = new AbortController();
    const path = endpointScope === "individual"
      ? `/individual-users/measurements/ecg-sessions/${sessionId}`
      : endpointScope !== "self"
      ? `/measurements/patients/${endpointScope}/ecg-sessions/${sessionId}`
      : `/measurements/ecg-sessions/${sessionId}`;

    setLoading(true);
    setError(null);

    api<EcgSessionDetailPayload>(path, { signal: controller.signal })
      .then(setSession)
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Could not load the recording");
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [api, sessionId, endpointScope]);

  return (
    <article className="relative overflow-hidden rounded-3xl border border-white/15 bg-white/5 p-6 shadow-2xl backdrop-blur-md">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent" />
      <div className="relative mb-4 flex items-start justify-between">
        <div>
          <p className="text-[11px] font-bold tracking-wider text-white/50 uppercase">Recording · Simulated demo</p>
          <h2 className="text-lg font-bold">ECG session</h2>
        </div>
        <button className="text-sm font-bold text-green-400 hover:text-green-300" onClick={onClose}>
          Close
        </button>
      </div>

      {loading ? <p className="text-sm text-white/50">Loading waveform…</p> : null}
      {error ? <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">{error}</p> : null}

      {session ? (
        <>
          <EcgStaticTrace
            samples={session.samples}
            sampleRate={session.sampleRate}
            className="h-[260px]"
          />
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-white/50">
            <span>{formatDateTime(session.startedAt)}</span>
            <span>{session.sampleRate} Hz</span>
            <span>{session.sampleCount.toLocaleString()} samples</span>
            <span>{formatDuration(session.durationSeconds)}</span>
            {session.inProgress ? (
              <span className="rounded-full border border-green-500/30 bg-green-500/10 px-2 py-0.5 text-green-400">
                In progress
              </span>
            ) : null}
          </div>
        </>
      ) : null}
    </article>
  );
}
