"use client";

import { AccessPanel } from "@/components/access-panel";
import { LoadingState } from "@/components/ui/LoadingState";
import { useClinicPatient } from "@/components/clinic/patient-provider";

export default function ClinicPatientDoctors() {
  const { loading, doctors, pendingDoctors, busyDoctorId, respondToDoctor, revokeDoctor } =
    useClinicPatient();

  if (loading) {
    return <LoadingState message="Loading your care team…" />;
  }

  return (
    <>
      <h1 className="text-2xl font-bold text-white">Doctors &amp; access</h1>
      <AccessPanel
        pending={pendingDoctors}
        accepted={doctors}
        busyDoctorId={busyDoctorId}
        onRespond={(doctorId, action) => {
          void respondToDoctor(doctorId, action);
        }}
        onRevoke={(doctorId) => {
          void revokeDoctor(doctorId);
        }}
      />
    </>
  );
}
