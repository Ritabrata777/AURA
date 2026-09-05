"use client";

import { usePathname, useRouter } from "next/navigation";
import { HeartPulse, User } from "lucide-react";
import { ClinicDoctorProvider, useClinicDoctor } from "@/components/clinic/doctor-provider";
import { PillNav } from "@/components/pill-nav";
import { KioskScreen } from "@/components/kiosk";
import { useAuth } from "@/lib/auth";

const navigation = [
  { name: "Dashboard", href: "/clinic/doctor/dashboard" },
  { name: "Patients", href: "/clinic/doctor/patients" },
  { name: "Appointments", href: "/clinic/doctor/appointments" },
  { name: "Prescriptions", href: "/clinic/doctor/prescriptions" },
];

function Banners() {
  const { error, notice, live, selectedPatientId, urgent } = useClinicDoctor();
  return (
    <>
      {urgent && selectedPatientId ? (
        <div className="flex items-center justify-between rounded-2xl border border-red-500/30 bg-red-500/10 px-6 py-3 text-xs">
          <div className="flex items-center gap-3 font-bold text-red-400">
            ⚠ URGENT: Abnormal vitals detected. Clinician review required immediately.
          </div>
        </div>
      ) : null}
      {error ? (
        <p className="rounded-2xl border border-red-500/30 bg-red-500/10 px-6 py-3 text-xs font-bold text-red-400">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="rounded-2xl border border-green-500/30 bg-green-500/10 px-6 py-3 text-xs font-bold text-green-400">
          {notice}
        </p>
      ) : null}
      {live.error && selectedPatientId ? (
        <p className="rounded-2xl border border-orange-500/30 bg-orange-500/10 px-6 py-3 text-xs font-bold text-orange-400">
          Live feed: {live.error}
        </p>
      ) : null}
    </>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { selected, live } = useClinicDoctor();
  const { logout } = useAuth();

  return (
    <KioskScreen>
      <PillNav
        brandHref="/clinic/doctor/dashboard"
        activeHref={pathname}
        links={navigation.map(({ name, href }) => ({ label: name, href }))}
        onLogout={() => {
          logout();
          sessionStorage.removeItem("clinic.doctor.selectedPatientId");
          router.replace("/");
        }}
      >
        <button
          type="button"
          onClick={() => router.push("/clinic/doctor/patients")}
          title="Choose a patient from your care list"
          className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 transition-colors hover:bg-white/10"
        >
          <User size={13} className="text-violet-400" />
          <span className="max-w-44 truncate text-[10px] font-semibold text-white/80">
            {selected ? selected.email : "Select a patient"}
          </span>
        </button>
      </PillNav>

      <main className="mx-auto flex flex-col gap-4 px-4 pb-10 pt-24 sm:px-6 lg:px-10">
        <Banners />
        {children}
      </main>
    </KioskScreen>
  );
}

export default function ClinicDoctorLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClinicDoctorProvider>
      <Shell>{children}</Shell>
    </ClinicDoctorProvider>
  );
}
