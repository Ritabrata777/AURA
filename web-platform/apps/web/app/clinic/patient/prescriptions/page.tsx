"use client";

import { MyPrescriptions } from "@/components/patient-prescriptions";

export default function ClinicPatientPrescriptions() {
  return (
    <>
      <h1 className="text-2xl font-bold text-white">Prescriptions</h1>
      <MyPrescriptions />
    </>
  );
}
