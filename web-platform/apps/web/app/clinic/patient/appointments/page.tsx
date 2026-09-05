"use client";

import { ConsultationCard } from "@/components/consultation-card";

export default function ClinicPatientAppointments() {
  return (
    <>
      <h1 className="text-2xl font-bold text-white">Appointments</h1>
      <p className="text-sm text-white/50">
        Video consultations are started by your doctor — this card updates live.
      </p>
      <ConsultationCard role="patient" className="h-80" />
    </>
  );
}
