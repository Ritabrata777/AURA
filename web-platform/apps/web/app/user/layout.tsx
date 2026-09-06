"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Activity,
  Heart,
  HeartPulse,
  Home,
  Settings,
  User,
  TrendingUp,
  LogOut,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { KioskScreen } from "@/components/kiosk";
import { PillNav } from "@/components/pill-nav";
import { PageTransition } from "@/components/ui/PageTransition";

const navigation = [
  { name: "Dashboard", href: "/user/dashboard", icon: Home, mobile: true },
  { name: "ECG", href: "/user/ecg", icon: HeartPulse, mobile: true },
  { name: "Vitals", href: "/user/vitals", icon: Heart, mobile: true },
  { name: "Trends", href: "/user/trends", icon: TrendingUp, mobile: true },
  { name: "Devices", href: "/user/devices", icon: Activity, mobile: true },
  { name: "Profile", href: "/user/profile", icon: User, mobile: false },
  { name: "Settings", href: "/user/settings", icon: Settings, mobile: false },
];

export default function UserLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout } = useAuth();

  const mobileNav = navigation.filter((item) => item.mobile);

  const handleLogout = () => {
    logout();
    router.replace("/");
  };

  return (
    <KioskScreen>
      {/* Floating pill navigation (desktop) */}
      <PillNav
        brandHref="/user/dashboard"
        activeHref={pathname}
        links={navigation.map(({ name, href }) => ({ label: name, href }))}
        onLogout={handleLogout}
      />

      {/* Mobile top bar */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-white/10 bg-[#121212]/80 px-4 py-3 backdrop-blur-xl lg:hidden">
        <span className="flex items-center gap-2 text-base font-bold text-white">
          <HeartPulse className="h-5 w-5 text-red-400" />
          AURA
        </span>
        <div className="flex items-center gap-1">
          <Link
            href="/user/settings"
            className={`rounded-lg p-2 ${
              pathname === "/user/settings" ? "bg-white/10 text-white" : "text-white/50"
            }`}
            aria-label="Settings"
          >
            <Settings className="h-5 w-5" />
          </Link>
          <Link
            href="/user/profile"
            className={`rounded-lg p-2 ${
              pathname === "/user/profile" ? "bg-white/10 text-white" : "text-white/50"
            }`}
            aria-label="Profile"
          >
            <User className="h-5 w-5" />
          </Link>
          <button
            onClick={handleLogout}
            className="rounded-lg p-2 text-white/50"
            aria-label="Log out"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto px-4 pb-28 pt-8 sm:px-6 lg:px-10 lg:pb-10 lg:pt-28">
        <PageTransition>
          {children}
        </PageTransition>
      </main>

      {/* Mobile bottom navigation */}
      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-white/10 bg-[#121212]/80 backdrop-blur-xl lg:hidden">
        {mobileNav.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium ${
                active ? "text-violet-300" : "text-white/50"
              }`}
            >
              <item.icon className={`h-5 w-5 ${active ? "text-violet-300" : ""}`} />
              {item.name}
            </Link>
          );
        })}
      </nav>
    </KioskScreen>
  );
}
