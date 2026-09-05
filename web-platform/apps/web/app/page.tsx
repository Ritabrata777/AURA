"use client";

import { useAuth } from "../lib/auth";
import { LoginScreen } from "../components/login-screen";
import { glassPanel, InnerGlow, KioskScreen } from "../components/kiosk";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function HomePage() {
  const { status, user, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated" && user) {
      // Route each role to its own multi-page experience.
      if (user.role === "INDIVIDUAL_USER") {
        router.replace("/user/dashboard");
      } else if (user.role === "PATIENT") {
        router.replace("/clinic/patient/dashboard");
      } else if (user.role === "DOCTOR") {
        router.replace("/clinic/doctor/dashboard");
      }
    }
  }, [status, user, router]);

  if (status === "loading") {
    return (
      <KioskScreen className="flex items-center justify-center p-4">
        <p className="text-sm text-white/50">Loading…</p>
      </KioskScreen>
    );
  }

  if (status === "unauthenticated" || !user) {
    return <LoginScreen />;
  }

  if (user.role !== "ADMIN") {
    // One frame while the effect routes to the role's home.
    return (
      <KioskScreen className="flex items-center justify-center p-4">
        <p className="text-sm text-white/50">Redirecting…</p>
      </KioskScreen>
    );
  }

  return (
    <KioskScreen className="flex items-center justify-center p-4">
      <section className={`${glassPanel} w-full max-w-md p-8`}>
        <InnerGlow />
        <h1 className="text-2xl font-bold tracking-tight">Admin account</h1>
        <p className="mt-3 text-sm text-white/50">
          Administrator accounts have no clinical dashboard. Sign in with a patient or clinician
          account to view measurements.
        </p>
        <button
          className="mt-6 w-full rounded-xl bg-white/10 py-3 font-bold hover:bg-white/15"
          onClick={logout}
        >
          Sign out
        </button>
      </section>
    </KioskScreen>
  );
}
