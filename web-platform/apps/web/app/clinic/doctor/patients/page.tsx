"use client";

import { useRouter } from "next/navigation";
import { useClinicDoctor } from "@/components/clinic/doctor-provider";
import { glassPanel } from "@/components/kiosk";
import { formatDateTime } from "@/lib/format";

export default function ClinicDoctorPatients() {
  const { accepted, awaiting, selectedPatientId, selectPatient, requestEmail, setRequestEmail, requestAccess } =
    useClinicDoctor();
  const router = useRouter();

  return (
    <>
      <h1 className="text-2xl font-bold text-white">Patients</h1>

      <section className={`${glassPanel} p-6`}>
        <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-white/60">Care list</h2>
        {accepted.length === 0 ? (
          <p className="text-sm text-white/50">
            No patient has approved your access yet. Request access with their email below.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {accepted.map((patient) => (
              <button
                key={patient.patientId}
                onClick={() => {
                  selectPatient(patient.patientId);
                  router.push("/clinic/doctor/dashboard");
                }}
                className={`rounded-xl border px-4 py-3 text-left transition-colors ${
                  selectedPatientId === patient.patientId
                    ? "border-green-500/40 bg-green-500/10"
                    : "border-white/10 bg-black/40 hover:bg-white/5"
                }`}
              >
                <strong className="block text-sm text-white">{patient.email}</strong>
                <small className="text-[11px] text-white/50">
                  Connected {formatDateTime(patient.createdAt)}
                </small>
              </button>
            ))}
          </div>
        )}
      </section>

      {awaiting.length > 0 ? (
        <section className={`${glassPanel} p-6`}>
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-white/60">
            Awaiting approval
          </h2>
          <div className="space-y-2">
            {awaiting.map((patient) => (
              <div
                key={patient.patientId}
                className="flex justify-between rounded-lg border border-white/10 bg-black/40 p-3 text-sm"
              >
                <span className="text-white/80">{patient.email}</span>
                <span className="text-white/50">Pending</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className={`${glassPanel} p-6`}>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-white/60">
          Request access
        </h2>
        <form onSubmit={requestAccess} className="flex max-w-md flex-col gap-2">
          <input
            type="email"
            value={requestEmail}
            onChange={(event) => setRequestEmail(event.target.value)}
            placeholder="patient@example.com"
            autoComplete="off"
            className="rounded-xl border border-white/20 bg-black/40 px-3 py-2 text-sm text-white focus:border-green-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!requestEmail.trim()}
            className="rounded-xl bg-green-500 py-2 text-sm font-bold text-black transition hover:bg-green-400 disabled:opacity-40"
          >
            Request
          </button>
        </form>
        <p className="mt-2 text-xs text-white/40">
          The patient approves or declines from their dashboard. Nothing is shared until they do.
        </p>
      </section>

    </>
  );
}
