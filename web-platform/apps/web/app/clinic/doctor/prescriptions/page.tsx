"use client";

import Link from "next/link";
import { PrescriptionPanel } from "@/components/prescription-panel";
import { useClinicDoctor } from "@/components/clinic/doctor-provider";

export default function ClinicDoctorPrescriptions() {
  const { selected, selectedPatientId } = useClinicDoctor();

  if (!selectedPatientId) {
    return (
      <>
        <h1 className="text-2xl font-bold text-white">Prescriptions</h1>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center text-sm text-white/50">
          Select a patient first —{" "}
          <Link href="/clinic/doctor/patients" className="font-semibold text-green-400 hover:underline">
            open the care list
          </Link>
          .
        </div>
      </>
    );
  }

  return (
    <>
      <h1 className="text-2xl font-bold text-white">Prescriptions</h1>
      {/* Keyed by patient so switching patients remounts the panel and no
          half-written prescription carries across. */}
      <PrescriptionPanel
        key={selectedPatientId}
        patientId={selectedPatientId}
        patientEmail={selected?.email}
      />
    </>
  );
}
