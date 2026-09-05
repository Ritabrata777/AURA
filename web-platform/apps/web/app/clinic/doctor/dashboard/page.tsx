"use client";

import Link from "next/link";
import { VitalsCards } from "@/components/vitals-cards";
import { IcuMonitor } from "@/components/icu-monitor";
import { ConsultationCard } from "@/components/consultation-card";
import { LoadingState } from "@/components/ui/LoadingState";
import { useClinicDoctor } from "@/components/clinic/doctor-provider";
import { glassPanel, InnerGlow } from "@/components/kiosk";

export default function ClinicDoctorDashboard() {
  const {
    selected,
    selectedPatientId,
    loadingPatient,
    summaries,
    liveVitals,
    ecgChunk,
    liveSessionId,
  } = useClinicDoctor();

  if (!selectedPatientId) {
    return (
      <div className={`${glassPanel} grid place-items-center p-12`}>
        <InnerGlow />
        <div className="relative text-center">
          <h1 className="text-xl font-bold text-white">No patient selected</h1>
          <p className="mt-2 text-sm text-white/50">
            Choose a patient from your care list to view their live vitals and ECG.
          </p>
          <Link
            href="/clinic/doctor/patients"
            className="mt-5 inline-block rounded-xl bg-green-500 px-5 py-2.5 text-sm font-bold text-black transition hover:bg-green-400"
          >
            Open care list
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <h1 className="text-2xl font-bold text-white">
        {selected?.email ?? "Patient"}
        <span className="ml-3 align-middle text-xs font-medium text-white/40">live overview</span>
      </h1>

      {loadingPatient ? (
        <LoadingState message="Loading patient record…" />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="col-span-12 lg:col-span-5">
            <ConsultationCard
              role="doctor"
              patientId={selectedPatientId}
              patientEmail={selected?.email}
              className="h-72"
            />
          </div>
          <div className="col-span-12 lg:col-span-7">
            <VitalsCards summaries={summaries} live={liveVitals} />
          </div>
          <div className={`${glassPanel} col-span-12 flex min-h-[260px] flex-col p-3`}>
            <InnerGlow />
            <div className="relative flex-1">
              <IcuMonitor
                chunk={ecgChunk}
                live={liveVitals}
                hardwareId={selected?.email}
                recording={Boolean(liveSessionId)}
                emptyLabel="No recording in progress for this patient."
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
