"use client";

import Link from "next/link";
import { ConsultationCard } from "@/components/consultation-card";
import { useClinicDoctor } from "@/components/clinic/doctor-provider";

export default function ClinicDoctorAppointments() {
  const { selected, selectedPatientId } = useClinicDoctor();

  if (!selectedPatientId) {
    return (
      <>
        <h1 className="text-2xl font-bold text-white">Appointments</h1>
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
      <h1 className="text-2xl font-bold text-white">Appointments</h1>
      <ConsultationCard
        role="doctor"
        patientId={selectedPatientId}
        patientEmail={selected?.email}
        className="h-80"
      />
    </>
  );
}
