"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { TrendingUp } from "lucide-react";
import { TrendChart } from "@/components/ui/TrendChart";
import { EmptyState } from "@/components/ui/EmptyState";
import { glassCard } from "@/components/kiosk";
import { useAuth, useApi } from "@/lib/auth";
import { queryString } from "@/lib/api";
import type { MeasurementType, TrendPoint } from "@/lib/types";

const TRENDS: Array<{ type: MeasurementType; unit: string; title: string }> = [
  { type: "PIEZO_HEART_RATE", unit: "bpm", title: "Piezo Heart Rate" },
  { type: "MAX30102_HEART_RATE", unit: "bpm", title: "MAX30102 Heart Rate" },
  { type: "SPO2", unit: "%", title: "Blood Oxygen" },
  { type: "TEMPERATURE", unit: "°C", title: "Temperature" },
];

const RANGES = [7, 30, 90] as const;

export default function UserTrends() {
  const { status, token } = useAuth();
  const router = useRouter();
  const api = useApi();

  const [days, setDays] = useState<number>(7);
  const [trends, setTrends] = useState<Record<MeasurementType, TrendPoint[]>>({
    HEART_RATE: [],
    PIEZO_HEART_RATE: [],
    MAX30102_HEART_RATE: [],
    SPO2: [],
    TEMPERATURE: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (range: number) => {
      // The API takes type and days as query params on one endpoint.
      const results = await Promise.all(
        TRENDS.map(async ({ type }) => {
          const points = await api<TrendPoint[]>(
            `/individual-users/measurements/trends${queryString({ type, days: range })}`,
          );
          return [type, points] as const;
        }),
      );
      setTrends((previous) => ({
        ...previous,
        ...Object.fromEntries(results),
      }));
    },
    [api],
  );

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/");
    if (status !== "authenticated") return;

    let cancelled = false;
    setLoading(true);
    load(days)
      .then(() => {
        if (!cancelled) setError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load trends");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [status, router, load, days]);

  if (status !== "authenticated" || loading) {
    return (
      <div className="mx-auto max-w-5xl">
        <div className="mb-6">
          <div className="h-8 w-40 rounded bg-white/10 animate-pulse" />
          <div className="mt-2 h-4 w-64 rounded bg-white/10 animate-pulse" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className={`${glassCard} p-6 animate-pulse`}>
              <div className="mb-4 h-5 w-32 rounded bg-white/10" />
              <div className="h-40 rounded bg-white/5" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-5xl">
        <EmptyState
          icon={TrendingUp}
          title="Could not load trends"
          description={error}
          action={{ label: "Retry", onClick: () => void load(days).catch(() => undefined) }}
        />
      </div>
    );
  }

  const hasTrends = TRENDS.some(({ type }) => trends[type].length > 0);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white sm:text-3xl">Health Trends</h1>
          <p className="mt-1 text-sm text-white/50">
            How your recorded measurements change over time.
          </p>
        </div>
        <div className="flex gap-2">
          {RANGES.map((range) => (
            <button
              key={range}
              onClick={() => setDays(range)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                days === range
                  ? "bg-violet-500 text-white shadow-lg shadow-violet-500/25"
                  : "border border-white/15 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
              }`}
            >
              {range} days
            </button>
          ))}
        </div>
      </div>

      {!hasTrends ? (
        <EmptyState
          icon={TrendingUp}
          title="No trend data yet"
          description="Trends appear after a few days of recorded measurements from your device."
        />
      ) : (
        <div className="space-y-6">
          {TRENDS.map(({ type, unit, title }) =>
            trends[type].length > 0 ? (
              <section key={type} className={`${glassCard} p-5`}>
                <h2 className="mb-4 text-base font-semibold text-white">{title}</h2>
                <TrendChart data={trends[type]} type={type} unit={unit} />
              </section>
            ) : null,
          )}
        </div>
      )}

      <p className="mt-8 text-center text-xs text-white/30">
        Charts show recorded measurements, not medical diagnoses.
      </p>
    </div>
  );
}
