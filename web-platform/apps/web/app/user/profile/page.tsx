"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Mail, ShieldCheck, Hash } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { useAuth } from "@/lib/auth";
import { glassCard, InnerGlow } from "@/components/kiosk";
import { FadeIn } from "@/components/ui/PageTransition";

/**
 * Profile shows exactly what the platform actually knows about the account —
 * email, role, and user id from the session. The API has no profile endpoint
 * yet, so anything more would be fabricated.
 */
export default function UserProfile() {
  const { status, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/");
  }, [status, router]);

  if (status !== "authenticated") {
    return null;
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-4xl">
        <EmptyState icon={ShieldCheck} title="Not signed in" description="Log in to view your profile." />
      </div>
    );
  }

  return (
    <FadeIn>
      <div className="mx-auto max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white sm:text-3xl">Profile</h1>
        <p className="mt-1 text-sm text-white/50">Your account details.</p>
      </div>

      <div className={`${glassCard} p-6`}>
        <InnerGlow />
        <div className="relative space-y-5">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-500/20 text-xl font-bold text-blue-200">
              {user.email.slice(0, 1).toUpperCase()}
            </div>
            <div>
              <p className="text-lg font-semibold text-white">{user.email}</p>
              <span className="mt-1 inline-block rounded-full bg-violet-400/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-violet-300 ring-1 ring-violet-400/30">
                {user.role.replace("_", " ")}
              </span>
            </div>
          </div>

          <div className="space-y-3 border-t border-white/10 pt-5 text-sm">
            <div className="flex items-center gap-3 text-white/70">
              <Mail className="h-4 w-4 text-white/40" />
              {user.email}
            </div>
            <div className="flex items-center gap-3 text-white/70">
              <Hash className="h-4 w-4 text-white/40" />
              <span className="font-mono text-xs">{user.id}</span>
            </div>
            <div className="flex items-center gap-3 text-white/70">
              <ShieldCheck className="h-4 w-4 text-white/40" />
              Personal wellness account — devices and readings are private to this login.
            </div>
          </div>
        </div>
      </div>

      <p className="mt-6 text-center text-xs text-white/30">
        Editable profile details (name, date of birth, contact) arrive with the API&apos;s
        profile endpoint.
      </p>
      </div>
    </FadeIn>
  );
}
