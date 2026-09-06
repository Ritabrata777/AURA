"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Heart } from "lucide-react";
import { VitalCard } from "@/components/ui/VitalCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { useAuth, useApi } from "@/lib/auth";
import { useLiveFeed } from "@/lib/live";
import { glassCard } from "@/components/kiosk";
import type { Measurement, VitalSummary } from "@/lib/types";

const TYPE_LABELS: Record<Measurement["type"], string> = {
  HEART_RATE: "Heart Rate",
  SPO2: "Blood Oxygen",
  TEMPERATURE: "Temperature",
};

export default function UserVitals() {
  const { status, token } = useAuth();
  const router = useRouter();
  const api = useApi();

  const [vitals, setVitals] = useState<VitalSummary[]>([]);
  const [recent, setRecent] = useState<Measurement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [summary, measurements] = await Promise.all([
      api<VitalSummary[]>("/individual-users/measurements/summary"),
      api<Measurement[]>("/individual-users/measurements?limit=20"),
    ]);
    setVitals(summary);
    setRecent(measurements);
  }, [api]);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/");
    if (status !== "authenticated") return;

    let cancelled = false;
    load()
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
  }, [status, router, load]);

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
    },
  });

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
          action={{ label: "Retry", onClick: () => void load().catch(() => undefined) }}
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

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold text-white">Latest per vital</h2>
        {vitals.length === 0 ? (
          <EmptyState
            icon={Heart}
            title="No measurements yet"
            description="Your device will populate these cards as soon as it streams readings."
          />
        ) : (
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
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-white">Recent measurements</h2>
        {recent.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/15 p-8 text-center text-sm text-white/40">
            Measurements will appear here once your device starts collecting data.
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

      <p className="mt-8 text-center text-xs text-white/30">
        These measurements are for monitoring purposes and are not a medical diagnosis.
      </p>
    </div>
  );
}
