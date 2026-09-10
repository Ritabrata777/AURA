"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LoginScreen } from "../../components/login-screen";
import { KioskScreen } from "../../components/kiosk";
import { useAuth } from "../../lib/auth";

/**
 * Dedicated sign-in page. Signed-in visitors are bounced straight to their
 * role's dashboard so the role selector never shows twice.
 */
export default function LoginPage() {
  const { status, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated" && user) {
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

  return <LoginScreen />;
}