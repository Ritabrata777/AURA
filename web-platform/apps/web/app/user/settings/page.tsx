"use client";

import { Bell, Lock, Database, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { glassCard, InnerGlow } from "@/components/kiosk";
import { FadeIn } from "@/components/ui/PageTransition";

/**
 * Settings is deliberately honest: every control here would be a dead toggle,
 * so sections state what is planned instead of pretending to work. The one
 * real action is signing out.
 */
export default function UserSettings() {
  const { logout } = useAuth();
  const router = useRouter();

  const sections = [
    {
      icon: Bell,
      title: "Notifications",
      description: "Alerts for device offline events and unusual readings, delivered over email.",
    },
    {
      icon: Lock,
      title: "Privacy & Security",
      description: "Password changes and active session management.",
    },
    {
      icon: Database,
      title: "Data Management",
      description: "Export your measurement history or delete your account and its data.",
    },
  ];

  return (
    <FadeIn>
      <div className="mx-auto max-w-4xl">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white sm:text-3xl">Settings</h1>
          <p className="mt-1 text-sm text-white/50">Account preferences.</p>
        </div>

        <div className="space-y-4">
          {sections.map((section) => (
            <section key={section.title} className={`${glassCard} flex items-start gap-4 p-5`}>
              <InnerGlow />
              <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/5 text-white/40">
                <section.icon className="h-5 w-5" />
              </div>
              <div className="relative">
                <h3 className="text-sm font-semibold text-white">{section.title}</h3>
                <p className="mt-1 text-sm text-white/50">{section.description}</p>
                <p className="mt-2 inline-block rounded-full bg-white/5 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-white/40 ring-1 ring-white/10">
                  Coming soon
                </p>
              </div>
            </section>
          ))}

          <section className={`${glassCard} flex items-center justify-between gap-4 p-5`}>
            <InnerGlow />
            <div className="relative">
              <h3 className="text-sm font-semibold text-white">Session</h3>
              <p className="mt-1 text-sm text-white/50">
                Signing out clears this device&apos;s session immediately.
              </p>
            </div>
            <button
              onClick={() => {
                logout();
                router.replace("/");
              }}
              className="relative inline-flex items-center gap-2 rounded-lg border border-white/15 px-4 py-2 text-sm font-medium text-white/80 transition hover:bg-white/10 hover:text-white"
            >
              <LogOut className="h-4 w-4" />
              Log out
            </button>
          </section>
        </div>
      </div>
    </FadeIn>
  );
}
