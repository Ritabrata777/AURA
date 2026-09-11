"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, ArrowRight, HeartPulse, Radio, Wifi, WifiOff } from "lucide-react";
import { VitalCard } from "@/components/ui/VitalCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { DashboardSkeleton } from "@/components/ui/Skeleton";
import { EcgMonitor, type EcgMonitorHandle } from "@/components/user/ecg-monitor";
import { useAuth, useApi } from "@/lib/auth";
import { useLiveFeed } from "@/lib/live";
import { API_BASE_URL } from "@/lib/api";
import { glassCard } from "@/components/kiosk";
import type { DeviceSummary, LiveCommandAck, LiveMeasurement, MeasurementType, VitalSummary } from "@/lib/types";

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return "Good night";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/** Backend semantics: a heartbeat every 5 s; offline after 90 s of silence. */
function isOnline(lastSeenAt: string | null): boolean {
  if (!lastSeenAt) return false;
  return Date.now() - new Date(lastSeenAt).getTime() < 90_000;
}

const HEART_RATE_TYPES: readonly MeasurementType[] = ["HEART_RATE", "PIEZO_HEART_RATE", "MAX30102_HEART_RATE"];

export default function UserDashboard() {
  const { status, token } = useAuth();
  const router = useRouter();
  const api = useApi();

  const [vitals, setVitals] = useState<VitalSummary[]>([]);
  const [devices, setDevices] = useState<DeviceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [heartRate, setHeartRate] = useState<number | null>(null);
  const [busyDeviceId, setBusyDeviceId] = useState<string | null>(null);
  const monitorRef = useRef<EcgMonitorHandle>(null);

  const load = useCallback(async () => {
    const [summary, deviceList] = await Promise.all([
      api<VitalSummary[]>("/individual-users/measurements/summary"),
      api<DeviceSummary[]>("/individual-users/devices"),
    ]);
    setVitals(summary);
    setDevices(deviceList);
    const recordedHeartRate = summary.find((v) => HEART_RATE_TYPES.includes(v.type))?.latest;
    if (recordedHeartRate && recordedHeartRate.quality === "VALID") {
      setHeartRate(recordedHeartRate.value);
    }
  }, [api]);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/");
    if (status !== "authenticated") return;

    let cancelled = false;
    setLoading(true);
    load()
      .then(() => {
        if (!cancelled) setError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load dashboard data");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [status, router, load]);

  const live = useLiveFeed(token, {
    onMeasurement: (measurement: LiveMeasurement) => {
      const latest = {
        value: measurement.value,
        unit: measurement.unit,
        quality: measurement.quality,
        measuredAt: measurement.measuredAt,
      };

      setVitals((previous) => {
        const existing = previous.find((vital) => vital.type === measurement.type);
        if (!existing) {
          return [
            ...previous,
            {
              type: measurement.type,
              latest,
              baseline: null,
              deviationFromBaseline: null,
            },
          ];
        }

        return previous.map((vital) =>
          vital.type === measurement.type ? { ...vital, latest } : vital,
        );
      });

      if (HEART_RATE_TYPES.includes(measurement.type) && measurement.quality === "VALID") {
        setHeartRate(measurement.value);
      }
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
    onEcgChunk: (chunk) => {
      monitorRef.current?.pushChunk(chunk.samples, chunk.sampleRate);
    },
    onCommandAck: (ack) => {
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

  const device = devices[0] ?? null;
  const deviceOnline = device ? isOnline(device.lastSeenAt) : false;

  const handleSpo2Test = useCallback(() => {
    if (!device || !deviceOnline) {
      setError("Device must be online to run SpO₂ test.");
      return;
    }
    sendCommand(device.deviceId, "START_SPO2");
  }, [device, deviceOnline, sendCommand]);

  const handleTempTest = useCallback(() => {
    if (!device || !deviceOnline) {
      setError("Device must be online to run temperature test.");
      return;
    }
    sendCommand(device.deviceId, "START_TEMPERATURE");
  }, [device, deviceOnline, sendCommand]);

  const handleEcgTest = useCallback(() => {
    if (!device || !deviceOnline) {
      setError("Device must be online to run ECG test.");
      return;
    }
    sendCommand(device.deviceId, "START_ECG", 60);
  }, [device, deviceOnline, sendCommand]);

  if (status !== "authenticated" || loading) {
    return <DashboardSkeleton />;
  }

  if (error) {
    return (
      <div className="mx-auto max-w-5xl">
        <EmptyState
          icon={Activity}
          title="Could not load your dashboard"
          description={error}
          action={{ label: "Retry", onClick: () => void load().catch(() => undefined) }}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      {/* Header */}
      <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white sm:text-3xl">{greeting()}</h1>
          <p className="mt-1 text-sm text-white/50">Here is your health overview.</p>
        </div>
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
          {live.status === "ready"
            ? "Live"
            : live.status === "connecting" || live.status === "authenticating"
              ? "Connecting…"
              : live.status === "disconnected"
                ? "Reconnecting…"
                : "Live feed offline"}
        </span>
      </div>

      {devices.length === 0 ? (
        <EmptyState
          icon={Radio}
          title="No device connected"
          description="Connect your Health Monitor to start receiving live measurements."
          action={{ label: "Pair a device", onClick: () => router.push("/user/devices") }}
        />
      ) : (
        <div className="space-y-6">
          {!deviceOnline ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300/20 bg-amber-300/5 px-4 py-3 text-sm">
              <div>
                <p className="font-semibold text-amber-200">Device is paired but offline</p>
                <p className="mt-0.5 text-xs text-white/50">Live readings will appear after the ESP32 sends a heartbeat.</p>
              </div>
              <button
                onClick={() => router.push("/user/devices")}
                className="rounded-lg border border-amber-200/20 px-3 py-1.5 text-xs font-semibold text-amber-100 hover:bg-amber-200/10"
              >
                Check connection
              </button>
            </div>
          ) : null}

          {/* Device strip */}
          <section className={`${glassCard} relative overflow-hidden rounded-2xl p-6`}>
            {/* Background gradient */}
            <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-transparent opacity-50" />
            
            <div className="relative flex flex-wrap items-center justify-between gap-4 lg:gap-6">
              <div className="flex items-center gap-4">
                <div
                  className={`flex h-12 w-12 items-center justify-center rounded-xl ${
                    deviceOnline
                      ? "bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 text-emerald-300 ring-1 ring-emerald-400/30"
                      : "bg-white/5 text-white/40 ring-1 ring-white/10"
                  }`}
                >
                  {deviceOnline ? <Wifi className="h-6 w-6" /> : <WifiOff className="h-6 w-6" />}
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">Health Monitor</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-white/50">
                    <span className="font-mono">{device?.hardwareId}</span>
                    <span className="text-white/30">·</span>
                    <span className={deviceOnline ? "text-emerald-300" : "text-white/40"}>
                      {deviceOnline ? "Online" : "Offline"}
                    </span>
                  </p>
                </div>
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
                    {busyDeviceId === device?.deviceId ? "Run..." : "SpO₂"}
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
                    {busyDeviceId === device?.deviceId ? "Run..." : "Temp"}
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
                    {busyDeviceId === device?.deviceId ? "Run..." : "ECG"}
                  </span>
                </button>
                <button
                  onClick={() => router.push("/user/devices")}
                  className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-white/80 transition-all hover:bg-white/10 hover:text-white"
                >
                  Manage
                </button>
              </div>
            </div>
          </section>

          {/* Vitals */}
          <section className="mt-8">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">Today&apos;s readings</h2>
                <p className="mt-1 text-xs text-white/50">Latest measurements from your device</p>
              </div>
              <button
                onClick={() => router.push("/user/vitals")}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-violet-300 transition-all hover:bg-white/5 hover:text-white"
              >
                View all <ArrowRight className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {/* Always show these 4 cards */}
              {["PIEZO_HEART_RATE", "MAX30102_HEART_RATE", "SPO2", "TEMPERATURE"].map((type) => {
                const vital = vitals.find((v) => v.type === type);
                return (
                  <VitalCard
                    key={type}
                    type={type as any}
                    latest={vital?.latest ?? null}
                    baseline={vital?.baseline ?? null}
                    deviation={vital?.deviationFromBaseline ?? null}
                  />
                );
              })}
            </div>
          </section>

          {/* ECG preview */}
          <section className="mt-8">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">ECG Monitor</h2>
                <p className="mt-1 text-xs text-white/50">Real-time electrocardiogram streaming</p>
              </div>
              <button
                onClick={() => router.push("/user/ecg")}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-violet-300 transition-all hover:bg-white/5 hover:text-white"
              >
                Open monitor <ArrowRight className="h-4 w-4" />
              </button>
            </div>
            <div className={`${glassCard} relative overflow-hidden rounded-2xl p-5`}>
              {/* Background gradient */}
              <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-transparent opacity-50" />
              
              <div className="relative">
                <EcgMonitor
                  ref={monitorRef}
                  state={deviceOnline ? "live" : "idle"}
                  heartRate={heartRate}
                  className="h-48 sm:h-56"
                />
              </div>
              <div className="relative mt-4 flex items-center gap-2 text-xs text-white/50">
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500/10 ring-1 ring-red-500/20">
                  <HeartPulse className="h-3 w-3 text-red-400" />
                </div>
                Streams automatically while your device is recording
              </div>
            </div>
          </section>
        </div>
      )}

      <p className="mt-8 text-center text-xs text-white/30">
        These measurements are for monitoring purposes and are not a medical diagnosis.
      </p>
    </div>
  );
}
