"use client";

import { useCallback, useEffect, useState } from "react";
import { Pill, Plus, ShieldCheck, X } from "lucide-react";
import { useApi } from "../lib/auth";
import { formatDateTime } from "../lib/format";
import type { CreatePrescriptionInput, Prescription } from "../lib/types";

/** Frequencies a clinician actually writes, in standard abbreviations. */
const FREQUENCIES = ["OD", "BID", "TID", "QID", "QHS", "PRN", "STAT"] as const;
const ROUTES = ["PO (Oral)", "IV", "IM", "SC", "Topical", "Inhaled"] as const;

interface MedicationDraft {
  key: string;
  drug: string;
  dose: string;
  frequency: string;
  duration: string;
  route: string;
  instructions: string;
}

function emptyMedication(): MedicationDraft {
  return {
    key: Math.random().toString(36).slice(2),
    drug: "",
    dose: "",
    frequency: "BID",
    duration: "",
    route: "PO (Oral)",
    instructions: "",
  };
}

const inputClass =
  "w-full rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-sm text-white placeholder:text-white/30 focus:border-green-500 focus:outline-none";
const selectClass = `${inputClass} appearance-none [&>option]:text-black`;

export function PrescriptionPanel({
  patientId,
  patientEmail,
}: {
  patientId: string;
  patientEmail?: string;
}) {
  const api = useApi();

  const [history, setHistory] = useState<Prescription[]>([]);
  const [loading, setLoading] = useState(true);
  const [composing, setComposing] = useState(false);

  const [diagnosis, setDiagnosis] = useState("");
  const [notes, setNotes] = useState("");
  const [medications, setMedications] = useState<MedicationDraft[]>([emptyMedication()]);
  const [allergiesChecked, setAllergiesChecked] = useState(false);
  const [interactionsChecked, setInteractionsChecked] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadHistory = useCallback(
    async (signal?: AbortSignal) => {
      const list = await api<Prescription[]>(`/prescriptions/patients/${patientId}`, { signal });
      setHistory(list);
    },
    [api, patientId],
  );

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    loadHistory(controller.signal)
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setHistory([]);
        setError(err instanceof Error ? err.message : "Could not load prescriptions");
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [loadHistory]);

  const updateMedication = (key: string, patch: Partial<MedicationDraft>) => {
    setMedications((previous) =>
      previous.map((medication) =>
        medication.key === key ? { ...medication, ...patch } : medication,
      ),
    );
  };

  const resetComposer = () => {
    setDiagnosis("");
    setNotes("");
    setMedications([emptyMedication()]);
    setAllergiesChecked(false);
    setInteractionsChecked(false);
  };

  // Every drug row needs the three fields the API marks required; a blank row
  // would be rejected server-side, so it is caught here instead.
  const filled = medications.filter(
    (medication) => medication.drug.trim() && medication.dose.trim() && medication.frequency.trim(),
  );
  const canSubmit =
    Boolean(diagnosis.trim()) &&
    filled.length > 0 &&
    filled.length === medications.length &&
    allergiesChecked &&
    interactionsChecked &&
    !submitting;

  // A disabled button with no explanation reads as a broken button. Name the
  // first thing still missing so the clinician knows what to fix.
  const blockedBecause = !diagnosis.trim()
    ? "Enter a primary diagnosis to continue."
    : filled.length !== medications.length
      ? "Every drug row needs a name, a dose and a frequency."
      : !allergiesChecked || !interactionsChecked
        ? "Confirm both safety checks to sign."
        : null;

  const submit = async () => {
    if (!canSubmit) return;

    setSubmitting(true);
    setError(null);
    setNotice(null);

    const payload: CreatePrescriptionInput = {
      patientId,
      diagnosis: diagnosis.trim(),
      medications: filled.map((medication) => ({
        drug: medication.drug.trim(),
        dose: medication.dose.trim(),
        frequency: medication.frequency.trim(),
        ...(medication.duration.trim() ? { duration: medication.duration.trim() } : {}),
        ...(medication.route.trim() ? { route: medication.route.trim() } : {}),
        ...(medication.instructions.trim()
          ? { instructions: medication.instructions.trim() }
          : {}),
      })),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    };

    try {
      await api<Prescription>("/prescriptions", { method: "POST", body: payload });
      setNotice("Prescription signed. It is now visible on the patient's dashboard.");
      resetComposer();
      setComposing(false);
      await loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the prescription");
    } finally {
      setSubmitting(false);
    }
  };

  const cancelPrescription = async (prescriptionId: string) => {
    setError(null);
    try {
      await api<Prescription>(`/prescriptions/${prescriptionId}/status`, {
        method: "PATCH",
        body: { status: "CANCELLED" },
      });
      await loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not cancel the prescription");
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-400">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="rounded-xl border border-green-500/30 bg-green-500/10 px-3 py-2 text-xs font-bold text-green-400">
          {notice}
        </p>
      ) : null}

      {!composing ? (
        <button
          onClick={() => {
            setComposing(true);
            setNotice(null);
          }}
          className="flex items-center justify-center gap-2 rounded-xl bg-green-500 py-3 text-sm font-bold text-black transition hover:bg-green-400"
        >
          <Plus size={16} /> New prescription
        </button>
      ) : (
        <div className="flex flex-col gap-4">
          <div>
            <h3 className="mb-2 text-sm font-medium tracking-wider text-white/60 uppercase">
              Primary diagnosis
            </h3>
            <div className="flex items-center gap-3 rounded-xl border border-green-500/50 bg-white/10 p-3 shadow-[0_0_10px_rgba(34,197,94,0.1)]">
              <ShieldCheck className="shrink-0 text-green-500" size={20} />
              <input
                value={diagnosis}
                onChange={(event) => setDiagnosis(event.target.value)}
                placeholder="e.g. Acute pharyngitis"
                className="w-full bg-transparent text-sm font-medium text-white placeholder:text-white/30 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-medium tracking-wider text-white/60 uppercase">
                Medications
              </h3>
              <button
                onClick={() => setMedications((previous) => [...previous, emptyMedication()])}
                className="text-xs font-bold text-green-400 transition hover:text-green-300"
              >
                + Add drug
              </button>
            </div>

            <div className="flex flex-col gap-3">
              {medications.map((medication) => (
                <div
                  key={medication.key}
                  className="relative rounded-xl border border-white/15 bg-black/40 p-4"
                >
                  <div className="absolute top-4 bottom-4 left-0 w-1 rounded-r-md bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.8)]" />
                  <div className="mb-3 ml-2 flex items-start justify-between gap-2">
                    <input
                      value={medication.drug}
                      onChange={(event) =>
                        updateMedication(medication.key, { drug: event.target.value })
                      }
                      placeholder="Drug name"
                      className="w-full bg-transparent font-bold tracking-tight text-white placeholder:font-normal placeholder:text-white/30 focus:outline-none"
                    />
                    {medications.length > 1 ? (
                      <button
                        onClick={() =>
                          setMedications((previous) =>
                            previous.filter((item) => item.key !== medication.key),
                          )
                        }
                        className="text-white/40 transition-colors hover:text-red-500"
                        aria-label="Remove medication"
                      >
                        <X size={18} />
                      </button>
                    ) : null}
                  </div>

                  <div className="ml-2 grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-white/60 uppercase">
                        Dose
                      </label>
                      <input
                        value={medication.dose}
                        onChange={(event) =>
                          updateMedication(medication.key, { dose: event.target.value })
                        }
                        placeholder="500 mg"
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-white/60 uppercase">
                        Freq
                      </label>
                      <select
                        value={medication.frequency}
                        onChange={(event) =>
                          updateMedication(medication.key, { frequency: event.target.value })
                        }
                        className={selectClass}
                      >
                        {FREQUENCIES.map((frequency) => (
                          <option key={frequency}>{frequency}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-white/60 uppercase">
                        Duration
                      </label>
                      <input
                        value={medication.duration}
                        onChange={(event) =>
                          updateMedication(medication.key, { duration: event.target.value })
                        }
                        placeholder="5 days"
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-white/60 uppercase">
                        Route
                      </label>
                      <select
                        value={medication.route}
                        onChange={(event) =>
                          updateMedication(medication.key, { route: event.target.value })
                        }
                        className={selectClass}
                      >
                        {ROUTES.map((route) => (
                          <option key={route}>{route}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="mt-3 ml-2">
                    <label className="mb-1 block text-xs font-medium text-white/60 uppercase">
                      Instructions
                    </label>
                    <input
                      value={medication.instructions}
                      onChange={(event) =>
                        updateMedication(medication.key, { instructions: event.target.value })
                      }
                      placeholder="After food"
                      className={inputClass}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium tracking-wider text-white/60 uppercase">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={2}
              placeholder="Advice for the patient"
              className={`${inputClass} resize-none`}
            />
          </div>

          {/* These are a real attestation, not decoration: the submit button
              stays disabled until the clinician confirms both. */}
          <div className="border-t border-white/10 pt-4">
            <div className="mb-2 text-xs font-bold tracking-wider text-white/60 uppercase">
              Safety review
            </div>
            <div className="mb-4 space-y-2 text-xs text-white/80">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={allergiesChecked}
                  onChange={(event) => setAllergiesChecked(event.target.checked)}
                  className="rounded accent-green-500"
                />
                Patient allergies verified safe
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={interactionsChecked}
                  onChange={(event) => setInteractionsChecked(event.target.checked)}
                  className="rounded accent-green-500"
                />
                No known drug interactions
              </label>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => {
                  setComposing(false);
                  resetComposer();
                  setError(null);
                }}
                className="rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-bold text-white/70 hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={!canSubmit}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-green-500 py-3.5 font-bold text-black shadow-[0_0_20px_rgba(34,197,94,0.4)] transition hover:bg-green-400 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
              >
                {submitting ? "Signing…" : "Sign & issue Rx"}
              </button>
            </div>

            {blockedBecause ? (
              <p className="mt-2 text-center text-[11px] text-white/40">{blockedBecause}</p>
            ) : null}
          </div>
        </div>
      )}

      <div>
        <h3 className="mb-3 text-sm font-bold tracking-wider text-white/60 uppercase">
          Issued prescriptions
        </h3>

        {loading ? (
          <p className="text-sm text-white/50">Loading prescriptions…</p>
        ) : history.length === 0 ? (
          <p className="text-sm text-white/50">
            Nothing prescribed for {patientEmail ?? "this patient"} yet.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {history.map((prescription) => (
              <PrescriptionCard
                key={prescription.id}
                prescription={prescription}
                onCancel={() => cancelPrescription(prescription.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const STATUS_TONES: Record<string, string> = {
  ACTIVE: "border-green-500/40 bg-green-500/15 text-green-400",
  COMPLETED: "border-white/20 bg-white/10 text-white/60",
  CANCELLED: "border-red-500/40 bg-red-500/15 text-red-400",
};

function PrescriptionCard({
  prescription,
  onCancel,
}: {
  prescription: Prescription;
  onCancel?: () => void;
}) {
  return (
    <div className="rounded-xl border border-white/15 bg-black/40 p-4">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-bold text-white">{prescription.diagnosis}</div>
          <div className="text-[11px] text-white/50">
            {formatDateTime(prescription.createdAt)}
          </div>
        </div>
        <span
          className={`shrink-0 rounded border px-2 py-1 text-[10px] font-bold tracking-widest uppercase ${
            STATUS_TONES[prescription.status] ?? STATUS_TONES.COMPLETED
          }`}
        >
          {prescription.status}
        </span>
      </div>

      <ul className="mt-3 space-y-2">
        {prescription.medications.map((medication) => (
          <li key={medication.id} className="flex gap-2 text-sm text-white/90">
            <Pill size={14} className="mt-0.5 shrink-0 text-green-400" />
            <span>
              <strong className="text-white">{medication.drug}</strong> {medication.dose} ·{" "}
              {medication.frequency}
              {medication.duration ? ` · ${medication.duration}` : ""}
              {medication.route ? (
                <span className="text-white/50"> · {medication.route}</span>
              ) : null}
              {medication.instructions ? (
                <span className="block text-[11px] text-white/50">{medication.instructions}</span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>

      {prescription.notes ? (
        <p className="mt-3 border-t border-white/10 pt-3 text-xs text-white/60">
          {prescription.notes}
        </p>
      ) : null}

      {onCancel && prescription.status === "ACTIVE" ? (
        <button
          onClick={onCancel}
          className="mt-3 text-xs font-bold text-red-400 hover:underline"
        >
          Cancel prescription
        </button>
      ) : null}
    </div>
  );
}

export { PrescriptionCard };
