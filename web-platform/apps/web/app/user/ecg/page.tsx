"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  CircleStop,
  Play,
  Radio,
  X,
} from "lucide-react";
import { EcgMonitor, EcgStaticTrace, type EcgMonitorHandle } from "@/components/user/ecg-monitor";
import { LoadingState, LoadingSpinner } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { useAuth, useApi } from "@/lib/auth";
import { useLiveFeed } from "@/lib/live";
import { glassCard, InnerGlow } from "@/components/kiosk";
import type {
  CommandResult,
  DeviceSummary,
  EcgSessionDetail,
  EcgSessionSummary,
  LiveEcgChunk,
} from "@/lib/types";

/**
 * Live and historical ECG, driven entirely by real data: commands go to the
 * device over MQTT through the API, waveform samples stream back over the
 * socket, and finished recordings load from the database. No sample is ever
 * generated in the browser.
 */

type RecorderState = "idle" | "starting" | "live" | "ending" | "ended";
type AckState =
  | { kind: "idle" }
  | { kind: "sending"; command: string }
  | { kind: "acked"; command: string }
  | { kind: "failed"; command: string; message: string };

const DURATION_OPTIONS = [
  { label: "30 seconds", value: 30 },
  { label: "1 minute", value: 60 },
  { label: "5 minutes", value: 300 },
  { label: "Until I stop it", value: 0 },
] as const;

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export default function UserEcgPage() {
  const { status, token, user } = useAuth();
  const router = useRouter();
  const api = useApi();

  const [devices, setDevices] = useState<DeviceSummary[]>([]);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  const [recorder, setRecorder] = useState<RecorderState>("idle");
  const [ack, setAck] = useState<AckState>({ kind: "idle" });
  const [duration, setDuration] = useState<number>(60);
  const [heartRate, setHeartRate] = useState<number | null>(null);

  // Recording stats, updated at most ~5x/sec from socket events.
  const [stats, setStats] = useState({ sessionId: "", seconds: 0, samples: 0, rate: 250 });
  const recordStartRef = useRef<number | null>(null);
  const monitorRef = useRef<EcgMonitorHandle>(null);

  const [history, setHistory] = useState<EcgSessionSummary[]>([]);
  const [selected, setSelected] = useState<EcgSessionDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const refreshHistory = useCallback(async () => {
    try {
      setHistory(await api<EcgSessionSummary[]>("/individual-users/measurements/ecg-sessions"));
    } catch {
      // History is secondary; a failure here shouldn't break the live view.
    }
  }, [api]);

  // ── Initial load ──────────────────────────────────────────────────────
  useEffect(() => {
    if (status === "unauthenticated") router.replace("/");
    if (status !== "authenticated") return;

    let cancelled = false;
    (async () => {
      try {
        const list = await api<DeviceSummary[]>("/individual-users/devices");
        if (cancelled) return;
        setDevices(list);
        if (list.length > 0) {
          const preferred = list.find((d) => d.online) ?? list[0];
          setDeviceId(preferred.deviceId);
        }
        await refreshHistory();
      } catch (err) {
        if (!cancelled) {
          setPageError(err instanceof Error ? err.message : "Could not load your devices");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, router, api, refreshHistory]);

  // ── Live stream ───────────────────────────────────────────────────────
  const handleChunk = useCallback(
    (chunk: LiveEcgChunk) => {
      if (chunk.deviceId !== deviceId) return;
      monitorRef.current?.pushChunk(chunk.samples, chunk.sampleRate);

      const timestamp = Date.parse(chunk.timestamp);
      if (recordStartRef.current === null && !Number.isNaN(timestamp)) {
        recordStartRef.current = timestamp;
      }
      const started = recordStartRef.current;
      const seconds =
        started !== null && !Number.isNaN(timestamp)
          ? Math.max(0, (timestamp - started) / 1000)
          : 0;

      setRecorder((previous) => (previous === "live" ? previous : "live"));
      setStats((previous) => ({
        sessionId: chunk.sessionId,
        seconds,
        samples: previous.samples + chunk.samples.length,
        rate: chunk.sampleRate,
      }));
    },
    [deviceId],
  );

  const live = useLiveFeed(token, {
    onMeasurement: (measurement) => {
      if (measurement.type === "HEART_RATE" && measurement.quality === "VALID") {
        setHeartRate(measurement.value);
      }
    },
    onEcgChunk: handleChunk,
    onEcgSessionEnd: () => {
      recordStartRef.current = null;
      setRecorder((previous) => (previous === "live" ? "ended" : previous));
      void refreshHistory();
    },
    onCommandAck: (payload) => {
      setAck((previous) => {
        if (previous.kind !== "sending" || previous.command !== payload.command) {
          return previous;
        }
        return payload.status === "REJECTED"
          ? { kind: "failed", command: payload.command, message: payload.errorCode ?? "Rejected by device" }
          : { kind: "acked", command: payload.command };
      });
    },
    onDeviceStatus: (payload) => {
      setDevices((previous) =>
        previous.map((device) =>
          device.deviceId === payload.deviceId
            ? { ...device, lastSeenAt: payload.timestamp, online: true }
            : device,
        ),
      );
    },
  });

  const device = devices.find((d) => d.deviceId === deviceId) ?? null;

  const sendCommand = useCallback(
    async (command: "START_ECG" | "STOP_ECG") => {
      if (!device) return;
      setAck({ kind: "sending", command });
      try {
        const body =
          command === "START_ECG" && duration > 0
            ? { command, durationSeconds: duration }
            : { command };
        await api<CommandResult>(`/individual-users/devices/${device.deviceId}/commands`, {
          method: "POST",
          body,
        });
        if (command === "START_ECG") {
          setRecorder("starting");
          monitorRef.current?.reset();
          recordStartRef.current = null;
          setStats({ sessionId: "", seconds: 0, samples: 0, rate: 250 });
        }
      } catch (err) {
        setAck({
          kind: "failed",
          command,
          message: err instanceof Error ? err.message : "Could not reach the device",
        });
      }
    },
    [api, device, duration],
  );

  const openSession = useCallback(
    async (session: EcgSessionSummary) => {
      setSelected(null);
      setLoadingDetail(true);
      try {
        setSelected(
          await api<EcgSessionDetail>(
            `/individual-users/measurements/ecg-sessions/${session.id}`,
          ),
        );
      } catch {
        setSelected(null);
      } finally {
        setLoadingDetail(false);
      }
    },
    [api],
  );

  // ── Render ────────────────────────────────────────────────────────────
  if (status !== "authenticated" || loading) {
    // Unauthenticated renders here for one frame while the effect redirects.
    return <LoadingState message="Loading ECG monitor…" />;
  }

  if (pageError) {
    return (
      <div className="mx-auto max-w-5xl">
        <PageHeader />
        <EmptyState
          icon={Activity}
          title="Could not load the ECG monitor"
          description={pageError}
          action={{ label: "Retry", onClick: () => window.location.reload() }}
        />
      </div>
    );
  }

  if (devices.length === 0) {
    return (
      <div className="mx-auto max-w-5xl">
        <PageHeader />
        <EmptyState
          icon={Radio}
          title="No device connected"
          description="Pair your Health Monitor to record and review ECG sessions."
          action={{ label: "Pair a device", onClick: () => router.push("/user/devices") }}
        />
      </div>
    );
  }

  const busy = ack.kind === "sending";
  const canStart = Boolean(device?.online) && (recorder === "idle" || recorder === "ended");
  const canStop = recorder === "live" || recorder === "starting";

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader />

      {/* Device picker (only when more than one is paired) */}
      {devices.length > 1 ? (
        <div className="mb-4">
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-white/50">
            Device
          </label>
          <select
            value={deviceId ?? ""}
            onChange={(event) => {
              setDeviceId(event.target.value);
              setRecorder("idle");
              monitorRef.current?.reset();
            }}
            className="rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm text-white"
          >
            {devices.map((d) => (
              <option key={d.deviceId} value={d.deviceId} className="bg-[#121212]">
                {d.hardwareId} {d.online ? "· online" : "· offline"}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {/* Waveform */}
      <div className={`${glassCard} p-4`}>
        <InnerGlow />
        <div className="relative">
          <EcgMonitor
            ref={monitorRef}
            state={recorder === "live" ? "live" : recorder === "ended" ? "ended" : "idle"}
            heartRate={heartRate}
            className="h-56 sm:h-72"
          />
        </div>

        <div className="relative mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-white/50">
          <Stat label="Session" value={stats.sessionId ? stats.sessionId.slice(0, 8) : "—"} />
          <Stat label="Duration" value={recorder === "live" ? formatDuration(stats.seconds) : "—"} />
          <Stat label="Samples" value={stats.samples > 0 ? stats.samples.toLocaleString() : "—"} />
          <Stat label="Rate" value={`${stats.rate} Hz`} />
          <span className="ml-auto inline-flex items-center gap-1.5">
            <span
              className={`h-2 w-2 rounded-full ${
                live.status === "ready"
                  ? "bg-emerald-400"
                  : live.status === "error"
                    ? "bg-red-400"
                    : "bg-amber-300"
              }`}
            />
            {live.status === "ready"
              ? "Live connection"
              : live.status === "connecting" || live.status === "authenticating"
                ? "Connecting…"
                : live.status === "disconnected"
                  ? "Reconnecting…"
                  : "Live feed unavailable"}
          </span>
        </div>

        {/* Controls */}
        <div className="relative mt-4 flex flex-wrap items-center gap-3 border-t border-white/10 pt-4">
          {canStart ? (
            <>
              <select
                value={duration}
                onChange={(event) => setDuration(Number(event.target.value))}
                disabled={busy}
                className="rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm text-white disabled:opacity-50"
              >
                {DURATION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value} className="bg-[#121212]">
                    {option.label}
                  </option>
                ))}
              </select>
              <button
                onClick={() => void sendCommand("START_ECG")}
                disabled={busy || !device?.online}
                className="inline-flex items-center gap-2 rounded-lg bg-violet-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy ? <LoadingSpinner size="sm" /> : <Play className="h-4 w-4" />}
                Start recording
              </button>
            </>
          ) : null}

          {canStop ? (
            <button
              onClick={() => void sendCommand("STOP_ECG")}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg bg-red-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? <LoadingSpinner size="sm" /> : <CircleStop className="h-4 w-4" />}
              Stop recording
            </button>
          ) : null}

          {!device?.online ? (
            <p className="text-xs font-medium text-amber-300">
              Device is offline — recordings need a connection.
            </p>
          ) : null}

          {/* Command feedback */}
          <div className="ml-auto text-xs">
            {ack.kind === "sending" ? (
              <span className="text-white/50">
                Sending {ack.command === "START_ECG" ? "start" : "stop"} command…
              </span>
            ) : ack.kind === "acked" ? (
              <span className="font-medium text-emerald-400">✓ Device acknowledged</span>
            ) : ack.kind === "failed" ? (
              <span className="font-medium text-red-400">✕ {ack.message}</span>
            ) : recorder === "starting" ? (
              <span className="text-white/50">Waiting for the device to start…</span>
            ) : null}
          </div>
        </div>
      </div>

      {/* Historical session viewer */}
      {loadingDetail ? (
        <div className="mt-8">
          <LoadingState message="Loading recording…" />
        </div>
      ) : selected ? (
        <section className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">
                Recording {selected.id.slice(0, 8)}
                <span className="ml-2 rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-white/60">
                  Historical data
                </span>
              </h2>
              <p className="mt-0.5 text-xs text-white/50">
                {new Date(selected.startedAt).toLocaleString()} ·{" "}
                {formatDuration(selected.durationSeconds ?? 0)} ·{" "}
                {selected.sampleCount.toLocaleString()} samples at {selected.sampleRate} Hz
              </p>
            </div>
            <button
              onClick={() => setSelected(null)}
              className="rounded-lg border border-white/15 p-2 text-white/60 transition hover:bg-white/10 hover:text-white"
              title="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <EcgStaticTrace
            samples={selected.samples}
            sampleRate={selected.sampleRate}
            className="h-48 sm:h-60"
          />
        </section>
      ) : null}

      {/* History */}
      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold text-white">Past recordings</h2>
        {history.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/15 p-8 text-center text-sm text-white/40">
            No recordings yet — start one above and it will be saved here.
          </div>
        ) : (
          <div className={glassCard}>
            <table className="min-w-full divide-y divide-white/10 text-sm">
              <thead className="bg-white/5">
                <tr>
                  {["Started", "Duration", "Samples", "Status", ""].map((heading) => (
                    <th
                      key={heading}
                      className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white/50"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {history.map((session) => (
                  <tr key={session.id} className="hover:bg-white/5">
                    <td className="px-5 py-3 text-white">
                      {new Date(session.startedAt).toLocaleString()}
                    </td>
                    <td className="px-5 py-3 text-white/60">
                      {session.durationSeconds !== null
                        ? formatDuration(session.durationSeconds)
                        : "—"}
                    </td>
                    <td className="px-5 py-3 text-white/60">
                      {(session.chunkCount * 50).toLocaleString()}
                    </td>
                    <td className="px-5 py-3">
                      {session.inProgress ? (
                        <span className="inline-flex items-center gap-1.5 font-medium text-emerald-400">
                          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                          In progress
                        </span>
                      ) : (
                        <span className="text-white/50">Completed</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() => void openSession(session)}
                        className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-white/80 transition hover:bg-white/10"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="mt-6 text-center text-xs text-white/30">
        Recorded measurements from an engineering prototype — not a medical diagnosis.
        {user?.email ? ` Signed in as ${user.email}.` : ""}
      </p>
    </div>
  );
}

function PageHeader() {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-bold text-white sm:text-3xl">ECG Monitor</h1>
      <p className="mt-1 text-sm text-white/50">
        Record a live ECG with your device and review past sessions.
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span>
      <span className="font-medium text-white/40">{label} </span>
      <span className="font-semibold text-white/80">{value}</span>
    </span>
  );
}
