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
import { glassCard, InnerGlow } from "@/components/kiosk";
import type { DeviceSummary, LiveMeasurement, VitalSummary } from "@/lib/types";

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

export default function UserDashboard() {
  const { status, token } = useAuth();
  const router = useRouter();
  const api = useApi();

  const [vitals, setVitals] = useState<VitalSummary[]>([]);
  const [devices, setDevices] = useState<DeviceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [heartRate, setHeartRate] = useState<number | null>(null);
  const monitorRef = useRef<EcgMonitorHandle>(null);

  const load = useCallback(async () => {
    const [summary, deviceList] = await Promise.all([
      api<VitalSummary[]>("/individual-users/measurements/summary"),
      api<DeviceSummary[]>("/individual-users/devices"),
    ]);
    setVitals(summary);
    setDevices(deviceList);
    const recordedHeartRate = summary.find((v) => v.type === "HEART_RATE")?.latest;
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
      if (measurement.type === "HEART_RATE" && measurement.quality === "VALID") {
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
  });

  const device = devices[0] ?? null;
  const deviceOnline = device ? isOnline(device.lastSeenAt) : false;

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
          {/* Device strip */}
          <section className={`${glassCard} flex flex-wrap items-center justify-between gap-4 p-5`}>
            <InnerGlow />
            <div className="relative flex items-center gap-4">
              <div
                className={`flex h-11 w-11 items-center justify-center rounded-xl ${
                  deviceOnline
                    ? "bg-emerald-400/15 text-emerald-300"
                    : "bg-white/5 text-white/40"
                }`}
              >
                {deviceOnline ? <Wifi className="h-5 w-5" /> : <WifiOff className="h-5 w-5" />}
              </div>
              <div>
                <p className="text-sm font-semibold text-white">Health Monitor</p>
                <p className="text-xs text-white/50">
                  {device?.hardwareId} ·{" "}
                  {deviceOnline
                    ? "Connected"
                    : device?.lastSeenAt
                      ? `Last seen ${new Date(device.lastSeenAt).toLocaleTimeString()}`
                      : "Never connected"}
                </p>
              </div>
            </div>
            <button
              onClick={() => router.push("/user/devices")}
              className="relative rounded-xl border border-white/15 px-4 py-2 text-sm font-medium text-white/80 transition hover:bg-white/10 hover:text-white"
            >
              Manage device
            </button>
          </section>

          {/* Vitals */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Today&apos;s readings</h2>
              <button
                onClick={() => router.push("/user/vitals")}
                className="inline-flex items-center gap-1 text-sm font-medium text-violet-300 hover:text-blue-200"
              >
                All vitals <ArrowRight className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
          </section>

          {/* ECG preview */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">ECG</h2>
              <button
                onClick={() => router.push("/user/ecg")}
                className="inline-flex items-center gap-1 text-sm font-medium text-violet-300 hover:text-blue-200"
              >
                Open monitor <ArrowRight className="h-4 w-4" />
              </button>
            </div>
            <div className={`${glassCard} p-4`}>
              <InnerGlow />
              <div className="relative">
                <EcgMonitor
                  ref={monitorRef}
                  state={deviceOnline ? "live" : "idle"}
                  heartRate={heartRate}
                  className="h-40 sm:h-48"
                />
              </div>
              <p className="relative mt-3 flex items-center gap-1.5 text-xs text-white/40">
                <HeartPulse className="h-3.5 w-3.5 text-red-400" />
                Streams automatically while your device is recording.
              </p>
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
