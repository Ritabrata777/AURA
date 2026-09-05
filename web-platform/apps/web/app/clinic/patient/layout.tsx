"use client";

import { usePathname, useRouter } from "next/navigation";
import { HeartPulse } from "lucide-react";
import { ClinicPatientProvider, useClinicPatient } from "@/components/clinic/patient-provider";
import { PillNav } from "@/components/pill-nav";
import { KioskScreen } from "@/components/kiosk";
import { useAuth } from "@/lib/auth";

const navigation = [
  { name: "Dashboard", href: "/clinic/patient/dashboard" },
  { name: "Vitals", href: "/clinic/patient/vitals" },
  { name: "Appointments", href: "/clinic/patient/appointments" },
  { name: "Prescriptions", href: "/clinic/patient/prescriptions" },
  { name: "Doctors", href: "/clinic/patient/doctors" },
  { name: "Devices", href: "/clinic/patient/devices" },
];

function Banners() {
  const { error, notice, live } = useClinicPatient();
  return (
    <>
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
      {live.error ? (
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
  const { loading } = useClinicPatient();
  const { logout } = useAuth();

  return (
    <KioskScreen>
      <PillNav
        brandHref="/clinic/patient/dashboard"
        activeHref={pathname}
        links={navigation.map(({ name, href }) => ({ label: name, href }))}
        onLogout={() => {
          logout();
          router.replace("/");
        }}
      />

      <main className="mx-auto flex flex-col gap-4 px-4 pb-10 pt-24 sm:px-6 lg:px-10">
        {!loading ? <Banners /> : null}
        {children}
      </main>
    </KioskScreen>
  );
}

export default function ClinicPatientLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClinicPatientProvider>
      <Shell>{children}</Shell>
    </ClinicPatientProvider>
  );
}
