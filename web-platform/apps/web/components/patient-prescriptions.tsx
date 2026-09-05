"use client";

import { useEffect, useState } from "react";
import { ClipboardList } from "lucide-react";
import { useApi } from "../lib/auth";
import { glassPanel, InnerGlow } from "./kiosk";
import { PrescriptionCard } from "./prescription-panel";
import type { Prescription } from "../lib/types";

/**
 * The patient's own prescriptions, read-only. Cancelled ones stay visible so
 * a patient who was told to stop a drug can see that instruction rather than
 * finding the entry silently gone.
 */
export function MyPrescriptions() {
  const api = useApi();
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);

    api<Prescription[]>("/prescriptions", { signal: controller.signal })
      .then((list) => {
        setPrescriptions(list);
        setError(null);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setPrescriptions([]);
        setError(err instanceof Error ? err.message : "Could not load your prescriptions");
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [api]);

  const active = prescriptions.filter((prescription) => prescription.status === "ACTIVE");

  return (
    <article className={`${glassPanel} p-6`} id="prescriptions">
      <InnerGlow />
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold tracking-wider text-white/50 uppercase">
            From your doctors
          </p>
          <h2 className="text-lg font-bold">Prescriptions</h2>
        </div>
        {active.length > 0 ? (
          <span className="rounded-full border border-green-500/40 bg-green-500/15 px-3 py-1 text-[11px] font-bold text-green-400">
            {active.length} active
          </span>
        ) : null}
      </div>

      {error ? (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-400">
          {error}
        </p>
      ) : loading ? (
        <p className="text-sm text-white/50">Loading prescriptions…</p>
      ) : prescriptions.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <ClipboardList size={28} className="text-white/20" />
          <p className="text-sm text-white/50">
            No prescriptions yet. Anything your doctor issues will appear here.
          </p>
        </div>
      ) : (
        <div className="flex max-h-[420px] flex-col gap-3 overflow-y-auto pr-1">
          {prescriptions.map((prescription) => (
            <div key={prescription.id}>
              <PrescriptionCard prescription={prescription} />
              {prescription.doctor?.user.email ? (
                <p className="mt-1 px-1 text-[11px] text-white/40">
                  Issued by {prescription.doctor.user.email}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </article>
  );
}
