"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Heart } from "lucide-react";
import { VitalCard } from "@/components/ui/VitalCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { useAuth, useApi } from "@/lib/auth";
import { useLiveFeed } from "@/lib/live";
import { API_BASE_URL } from "@/lib/api";
import { glassCard } from "@/components/kiosk";
import { EcgSessionDetail } from "@/components/ecg-session-detail";
import { HemoglobinCard } from "@/components/hemoglobin-card";
import type { EcgSessionSummary, LiveCommandAck, Measurement, VitalSummary } from "@/lib/types";

const TYPE_LABELS: Record<Measurement["type"], string> = {
  HEART_RATE: "Heart Rate",
  PIEZO_HEART_RATE: "Piezo Heart Rate",
  MAX30102_HEART_RATE: "MAX30102 Heart Rate",
  SPO2: "Blood Oxygen",
  TEMPERATURE: "Temperature",
};

function formatVitalValue(type: Measurement["type"], value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "--";
  // Temperature needs 1 decimal place, heart rates need 0
  return value.toFixed(type === "TEMPERATURE" ? 1 : 0);
}

export default function UserVitals() {
  const { status, token } = useAuth();
  const router = useRouter();
  const api = useApi();

  const [vitals, setVitals] = useState<VitalSummary[]>([]);
  const [recent, setRecent] = useState<Measurement[]>([]);
  const [ecgSessions, setEcgSessions] = useState<EcgSessionSummary[]>([]);
  const [selectedEcgId, setSelectedEcgId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dayLoading, setDayLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rawValues, setRawValues] = useState<{ red: number; ir: number } | null>(null);
  const [busyDeviceId, setBusyDeviceId] = useState<string | null>(null);
  const [devices, setDevices] = useState<Array<{ deviceId: string; online: boolean }>>([]);
  const socketRef = useRef<typeof import("socket.io-client").Socket | null>(null);

  const load = useCallback(async (date: string) => {
    const startDate = `${date}T00:00:00.000`;
    const endDate = `${date}T23:59:59.999`;
    const [summary, measurements, sessions, deviceList] = await Promise.all([
      api<VitalSummary[]>("/individual-users/measurements/summary"),
      api<Measurement[]>(
        `/individual-users/measurements?limit=100&startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`,
      ),
      api<EcgSessionSummary[]>("/individual-users/measurements/ecg-sessions?limit=100"),
      api<Array<{ deviceId: string; hardwareId: string; online: boolean; lastSeenAt: string | null }>>(
        "/individual-users/devices",
      ),
    ]);
    setVitals(summary);
    setRecent(measurements);
    setEcgSessions(sessions);
    setDevices(deviceList.map(d => ({
      deviceId: d.deviceId,
      online: d.online || Boolean(d.lastSeenAt && Date.now() - new Date(d.lastSeenAt).getTime() < 90000),
    })));
  }, [api]);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/");
    if (status !== "authenticated") return;

    let cancelled = false;
    load(selectedDate)
      .then(() => {
        if (!cancelled) setError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load vitals");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [status, router, load, selectedDate]);

  const handleDateChange = (date: string) => {
    setSelectedDate(date);
    setSelectedEcgId(null);
    setDayLoading(true);
    const startDate = `${date}T00:00:00.000`;
    const endDate = `${date}T23:59:59.999`;
    api<Measurement[]>(
      `/individual-users/measurements?limit=100&startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`,
    )
      .then(setRecent)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load measurements"))
      .finally(() => setDayLoading(false));
  };

  const selectedDayEcg = ecgSessions.filter(
    (session) => new Date(session.startedAt).toISOString().slice(0, 10) === selectedDate,
  );

  const live = useLiveFeed(token, {
    onMeasurement: (measurement) => {
      // Live readings join the top of the list; the list stays bounded.
      setRecent((previous) =>
        [measurement, ...previous.filter((m) => m.id !== measurement.id)].slice(0, 20),
      );
      setVitals((previous) =>
        previous.map((vital) =>
          vital.type === measurement.type
            ? {
                ...vital,
                latest: {
                  value: measurement.value,
                  unit: measurement.unit,
                  quality: measurement.quality,
                  measuredAt: measurement.measuredAt,
                },
              }
            : vital,
        ),
      );
      if (measurement.red !== undefined && measurement.ir !== undefined) {
        setRawValues({ red: measurement.red, ir: measurement.ir });
      }
    },
    onCommandAck: (ack: LiveCommandAck) => {
      setBusyDeviceId(null);
      if (ack.status === "REJECTED") {
        setError(`Command ${ack.command} failed: ${ack.errorCode || "Unknown error"}`);
      }
    },
  });

  // Send command to device via socket
  const sendCommand = useCallback(
    async (deviceId: string, command: string, durationSeconds?: number) => {
      if (!token) return;
      setBusyDeviceId(deviceId);
      setError(null);
      
      const { io } = await import("socket.io-client");
      const socket = io(`${API_BASE_URL}/live`, {
        transports: ["websocket"],
        auth: { token },
      });
      
      socket.on("connect", () => {
        socket.emit("command:send", { deviceId, command, durationSeconds });
      });
      
      socket.on("command:ack", (ack: LiveCommandAck) => {
        setBusyDeviceId(null);
        if (ack.status === "REJECTED") {
          setError(`Command ${ack.command} failed: ${ack.errorCode || "Unknown error"}`);
        }
        socket.disconnect();
      });
      
      socket.on("connect_error", () => {
        setBusyDeviceId(null);
        setError("Failed to connect to device");
        socket.disconnect();
      });
      
      // Timeout after 10 seconds
      setTimeout(() => {
        if (busyDeviceId === deviceId) {
          setBusyDeviceId(null);
          setError("Command timeout");
        }
        socket.disconnect();
      }, 10000);
    },
    [token, busyDeviceId],
  );

  const primaryDevice = devices[0] ?? null;
  const deviceOnline = primaryDevice?.online ?? false;

  const handleSpo2Test = useCallback(() => {
    if (!primaryDevice || !deviceOnline) {
      setError("Device must be online to run SpO₂ test.");
      return;
    }
    sendCommand(primaryDevice.deviceId, "START_SPO2");
  }, [primaryDevice, deviceOnline, sendCommand]);

  const handleTempTest = useCallback(() => {
    if (!primaryDevice || !deviceOnline) {
      setError("Device must be online to run temperature test.");
      return;
    }
    sendCommand(primaryDevice.deviceId, "START_TEMPERATURE");
  }, [primaryDevice, deviceOnline, sendCommand]);

  const handleEcgTest = useCallback(() => {
    if (!primaryDevice || !deviceOnline) {
      setError("Device must be online to run ECG test.");
      return;
    }
    sendCommand(primaryDevice.deviceId, "START_ECG", 60);
  }, [primaryDevice, deviceOnline, sendCommand]);

  if (status !== "authenticated" || loading) {
    return (
      <div className="mx-auto max-w-5xl">
        <div className="mb-6">
          <div className="h-8 w-40 rounded bg-white/10 animate-pulse" />
          <div className="mt-2 h-4 w-64 rounded bg-white/10 animate-pulse" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <SkeletonCard key={i} lines={2} />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-5xl">
        <EmptyState
          icon={Heart}
          title="Could not load your vitals"
          description={error}
          action={{ label: "Retry", onClick: () => void load(selectedDate).catch(() => undefined) }}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white sm:text-3xl">Vital Signs</h1>
          <p className="mt-1 text-sm text-white/50">Current readings and recent measurements.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Single test measure buttons */}
          <button
            onClick={handleSpo2Test}
            disabled={!deviceOnline || busyDeviceId !== null}
            className="group relative rounded-xl bg-gradient-to-r from-cyan-500/25 to-cyan-600/20 px-3 py-2 text-sm font-semibold text-cyan-300 transition-all duration-300 hover:from-cyan-500/35 hover:to-cyan-600/30 hover:shadow-[0_0_20px_rgba(6,182,212,0.3)] ring-1 ring-cyan-400/30 hover:ring-cyan-400/50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <span className="flex items-center gap-1">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="transition-transform duration-300 group-hover:scale-110">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                <path d="m9 12 2 2 4-4"></path>
              </svg>
              {busyDeviceId === primaryDevice?.deviceId ? "Run..." : "SpO₂"}
            </span>
          </button>
          <button
            onClick={handleTempTest}
            disabled={!deviceOnline || busyDeviceId !== null}
            className="group relative rounded-xl bg-gradient-to-r from-orange-500/25 to-orange-600/20 px-3 py-2 text-sm font-semibold text-orange-300 transition-all duration-300 hover:from-orange-500/35 hover:to-orange-600/30 hover:shadow-[0_0_20px_rgba(249,115,22,0.3)] ring-1 ring-orange-400/30 hover:ring-orange-400/50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <span className="flex items-center gap-1">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="transition-transform duration-300 group-hover:scale-110">
                <path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z"></path>
              </svg>
              {busyDeviceId === primaryDevice?.deviceId ? "Run..." : "Temp"}
            </span>
          </button>
          <button
            onClick={handleEcgTest}
            disabled={!deviceOnline || busyDeviceId !== null}
            className="group relative rounded-xl bg-gradient-to-r from-emerald-500/25 to-emerald-600/20 px-3 py-2 text-sm font-semibold text-emerald-300 transition-all duration-300 hover:from-emerald-500/35 hover:to-emerald-600/30 hover:shadow-[0_0_20px_rgba(16,185,129,0.3)] ring-1 ring-emerald-400/30 hover:ring-emerald-400/50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <span className="flex items-center gap-1">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="transition-transform duration-300 group-hover:scale-110">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2"></path>
              </svg>
              {busyDeviceId === primaryDevice?.deviceId ? "Run..." : "ECG"}
            </span>
          </button>
          <span className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1.5 text-xs font-medium text-white/70 ring-1 ring-white/15">
            <span
              className={`h-2 w-2 rounded-full ${
                live.status === "ready"
                  ? "bg-emerald-400"
                  : live.status === "error"
                    ? "bg-red-400"
                    : "bg-amber-300"
              }`}
            />
            {live.status === "ready" ? "Live" : "Connecting…"}
          </span>
        </div>
      </div>

      <section className="mb-10">
        <div className="mb-5 flex items-end justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Latest per vital</h2>
            <p className="mt-1 text-xs text-white/50">Current readings from your device</p>
          </div>
        </div>
        {vitals.length === 0 ? (
          <EmptyState
            icon={Heart}
            title="No measurements yet"
            description="Your device will populate these cards as soon as it streams readings."
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {vitals.map((vital) => (
              <VitalCard
                key={vital.type}
                type={vital.type}
                latest={vital.latest}
                baseline={vital.baseline}
                deviation={vital.deviationFromBaseline}
              />
            ))}
          </div>
        )}
      </section>

      <section className="mb-10">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-white">Ranges and averages</h2>
            <p className="mt-1 text-sm text-white/50">
              Highest, lowest, average, and current values from your recent valid readings.
            </p>
          </div>
          <span className="text-xs text-white/40">Rolling 14-day summary</span>
        </div>
        <div className={`overflow-x-auto ${glassCard}`}>
          <table className="min-w-full divide-y divide-white/10 text-sm">
            <thead className="bg-white/5">
              <tr>
                {["Vital", "Current", "Average", "Lowest", "Highest", "Samples"].map((heading) => (
                  <th
                    key={heading}
                    className="whitespace-nowrap px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white/50"
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {vitals.map((vital) => {
                const baseline = vital.baseline;
                return (
                  <tr key={vital.type} className="hover:bg-white/5">
                    <td className="whitespace-nowrap px-5 py-4 font-medium text-white">
                      {TYPE_LABELS[vital.type]}
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 font-semibold text-cyan-200">
                      {formatVitalValue(vital.type, vital.latest?.value)} {vital.latest?.unit ?? ""}
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-white/80">
                      {formatVitalValue(vital.type, baseline?.average)} {vital.latest?.unit ?? ""}
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-white/80">
                      {formatVitalValue(vital.type, baseline?.min)} {vital.latest?.unit ?? ""}
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-white/80">
                      {formatVitalValue(vital.type, baseline?.max)} {vital.latest?.unit ?? ""}
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-white/60">
                      {baseline?.sampleCount ?? 0}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {vitals.length === 0 && (
            <p className="p-8 text-center text-sm text-white/40">
              Summary data will appear after your device records valid readings.
            </p>
          )}
        </div>
      </section>

      <HemoglobinCard rawValues={rawValues} />

      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">Measurements by date</h2>
            <p className="mt-1 text-sm text-white/50">Choose a date to view all readings recorded that day.</p>
          </div>
          <label className="flex items-center gap-2 text-sm text-white/60">
            <span className="sr-only">Select date</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(event) => handleDateChange(event.target.value)}
              className="rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm text-white outline-none transition focus:border-cyan-300/60"
            />
          </label>
        </div>
        {dayLoading ? (
          <div className={`p-8 text-center text-sm text-white/50 ${glassCard}`}>Loading readings...</div>
        ) : recent.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/15 p-8 text-center text-sm text-white/40">
            No measurements were recorded on {new Date(`${selectedDate}T12:00:00`).toLocaleDateString()}.
          </div>
        ) : (
          <div className={`overflow-x-auto ${glassCard}`}>
            <table className="min-w-full divide-y divide-white/10 text-sm">
              <thead className="bg-white/5">
                <tr>
                  {["Time", "Type", "Value", "Quality", "Device"].map((heading) => (
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
                {recent.map((measurement) => (
                  <tr key={measurement.id} className="hover:bg-white/5">
                    <td className="whitespace-nowrap px-5 py-3 text-white">
                      {new Date(measurement.measuredAt).toLocaleString()}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-white">
                      {TYPE_LABELS[measurement.type]}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 font-semibold text-white">
                      {measurement.value.toFixed(measurement.type === "TEMPERATURE" ? 1 : 0)}{" "}
                      {measurement.unit}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-medium ${
                          measurement.quality === "VALID"
                            ? "bg-emerald-400/15 text-emerald-300"
                            : measurement.quality === "INVALID"
                              ? "bg-amber-400/15 text-amber-300"
                              : "bg-white/10 text-white/60"
                        }`}
                      >
                        {measurement.quality === "VALID"
                          ? "Valid"
                          : measurement.quality === "INVALID"
                            ? "Check sensor"
                            : "Unavailable"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 font-mono text-white/50">
                      {measurement.device?.hardwareId ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-10">
        <div className="mb-3">
          <h2 className="text-lg font-semibold text-white">ECG recordings</h2>
          <p className="mt-1 text-sm text-white/50">ECG sessions recorded on the selected date.</p>
        </div>
        {selectedDayEcg.length === 0 ? (
          <div className={`p-8 text-center text-sm text-white/40 ${glassCard}`}>
            No ECG recording was found for this date.
          </div>
        ) : (
          <div className="space-y-4">
            <div className={`overflow-x-auto ${glassCard}`}>
              <table className="min-w-full text-sm">
                <thead className="bg-white/5 text-xs uppercase tracking-wider text-white/50">
                  <tr>
                    <th className="px-5 py-3 text-left">Recorded</th>
                    <th className="px-5 py-3 text-left">Duration</th>
                    <th className="px-5 py-3 text-left">Samples</th>
                    <th className="px-5 py-3 text-left">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {selectedDayEcg.map((session) => (
                    <tr key={session.id} className="text-white/80">
                      <td className="px-5 py-3">{new Date(session.startedAt).toLocaleTimeString()}</td>
                      <td className="px-5 py-3">{session.durationSeconds ?? "--"} sec</td>
                      <td className="px-5 py-3">{(session.sampleRate * (session.durationSeconds ?? 0)).toLocaleString()}</td>
                      <td className="px-5 py-3">
                        <button
                          type="button"
                          onClick={() => setSelectedEcgId(session.id)}
                          className="rounded-lg border border-cyan-300/30 bg-cyan-300/10 px-3 py-1.5 text-xs font-semibold text-cyan-200 hover:bg-cyan-300/20"
                        >
                          View graph
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {selectedEcgId ? (
              <EcgSessionDetail
                sessionId={selectedEcgId}
                individualUser
                onClose={() => setSelectedEcgId(null)}
              />
            ) : null}
          </div>
        )}
      </section>

      <p className="mt-8 text-center text-xs text-white/30">
        These measurements are for monitoring purposes and are not a medical diagnosis.
      </p>
    </div>
  );
}
