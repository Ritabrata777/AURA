"use client";

import { useState } from "react";
import { glassCard } from "@/components/kiosk";

const MODEL_URL = "https://aura-haemoglobin-api.onrender.com/predict";

interface Prediction {
  predicted_hb_g_dl: number;
  gender: string;
  age: number;
  red: number;
  ir: number;
  anemia_classification: string;
  warning: string | null;
}

export function HemoglobinCard({ rawValues }: { rawValues: { red: number; ir: number } | null }) {
  const [age, setAge] = useState("24");
  const [gender, setGender] = useState("1");
  // Raw Red/IR values must come from the MAX30102 device. They are
  // intentionally not editable in the browser.
  const sensorValues = rawValues;
  const [result, setResult] = useState<Prediction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function predict(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const numericAge = Number(age);
    const numericRed = sensorValues?.red ?? 0;
    const numericIr = sensorValues?.ir ?? 0;
    if (!Number.isInteger(numericAge) || numericAge < 1 || numericAge > 120) {
      setError("Enter an age from 1 to 120.");
      return;
    }
    if (!sensorValues || numericRed <= 0 || numericIr <= 0) {
      setError("Waiting for a valid MAX30102 reading.");
      return;
    }

    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch(MODEL_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ red: numericRed, ir: numericIr, age: numericAge, gender: Number(gender) }),
      });
      if (!response.ok) throw new Error(`Prediction service returned ${response.status}.`);
      setResult((await response.json()) as Prediction);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reach the prediction service.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={`${glassCard} mb-10 p-5 sm:p-6`}>
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-white">Hemoglobin estimate</h2>
        <p className="mt-1 text-sm text-white/50">
          Place a finger on the MAX30102 sensor to capture Red and IR values.
        </p>
      </div>
      <form onSubmit={predict} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
        <label className="text-sm text-white/70">
          Age
          <input value={age} onChange={(event) => setAge(event.target.value)} type="number" min="1" max="120" required className="mt-1 w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-white outline-none focus:border-cyan-300/60" />
        </label>
        <label className="text-sm text-white/70">
          Gender
          <select value={gender} onChange={(event) => setGender(event.target.value)} className="mt-1 w-full rounded-lg border border-white/15 bg-[#20202a] px-3 py-2 text-white outline-none focus:border-cyan-300/60">
            <option value="1">Male</option>
            <option value="0">Female</option>
          </select>
        </label>
        <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/50 sm:col-span-2 lg:col-span-2">
          MAX30102: waiting for device data
        </div>
        <button type="submit" disabled={busy || !sensorValues} className="rounded-lg bg-cyan-400 px-4 py-2 font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50">
          {busy ? "Predicting..." : "Predict"}
        </button>
      </form>
      {error ? <p className="mt-4 rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-300">{error}</p> : null}
      {result ? (
        <div className="mt-5 grid gap-3 border-t border-white/10 pt-5 sm:grid-cols-3">
          <div><p className="text-xs uppercase tracking-wider text-white/40">Estimated hemoglobin</p><p className="mt-1 text-2xl font-bold text-cyan-200">{result.predicted_hb_g_dl.toFixed(2)} g/dL</p></div>
          <div><p className="text-xs uppercase tracking-wider text-white/40">Classification</p><p className="mt-1 font-semibold text-white">{result.anemia_classification}</p></div>
          <div><p className="text-xs uppercase tracking-wider text-white/40">Model warning</p><p className="mt-1 text-sm text-white/70">{result.warning ?? "None reported"}</p></div>
        </div>
      ) : null}
      <p className="mt-4 text-xs text-amber-200/70">Research estimate only. This is not a blood test or medical diagnosis.</p>
    </section>
  );
}
