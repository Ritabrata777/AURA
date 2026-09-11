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
import { PageTransition } from "@/components/ui/PageTransition";
import { HealthCompanionBubble } from "@/components/ai";

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
      {/* Floating liquid glass navigation (desktop) */}
      <header className="pointer-events-none fixed inset-x-0 top-0 z-50 flex flex-col justify-center transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] translate-y-0 pt-0 lg:pt-2">
        <nav
          aria-label="Primary"
          className="pointer-events-auto mx-auto flex w-full items-center justify-center select-none transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] lg:max-w-fit lg:gap-2 lg:px-2 lg:py-1.5 lg:rounded-full lg:border lg:backdrop-blur-2xl lg:backdrop-saturate-150 lg:bg-[#1a1a2e]/80 lg:border-white/15 px-4 py-2.5 rounded-full bg-[#1a1a2e]/90 border-white/10 relative z-20 text-white shadow-2xl"
        >
          {/* Desktop navigation links */}
          <div className="hidden lg:flex items-center gap-1 pointer-events-auto">
            {navigation.map((item, index) => (
              <Link
                key={item.name}
                href={item.href}
                className="group relative inline-flex items-center shrink-0 text-[11px] font-medium uppercase leading-none tracking-wide transition-colors duration-300"
                style={{ transitionDelay: `${index * 30}ms` }}
              >
                <span
                  className={`relative z-10 px-3 py-2 ${
                    pathname === item.href
                      ? "text-white"
                      : "text-white/60 hover:text-white/80"
                  }`}
                >
                  {item.name}
                </span>
                <span
                  className={`absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-violet-500 to-purple-500 transition-transform duration-300 ease-out origin-left ${
                    pathname === item.href ? "scale-x-100 shadow-[0_0_8px_rgba(139,92,246,0.5)]" : "scale-x-0 group-hover:scale-x-100"
                  }`}
                />
              </Link>
            ))}
          </div>

          {/* Divider */}
          <div className="hidden lg:block h-4 w-px bg-white/15 mx-1" />

          {/* Right side actions */}
          <div className="hidden lg:flex shrink-0 items-center gap-2 pl-2">
            <Link
              href="/user/profile"
              className={`group relative inline-flex items-center shrink-0 text-[11px] font-medium uppercase leading-none tracking-wide transition-colors duration-300 ${
                pathname === "/user/profile"
                  ? "text-white"
                  : "text-white/60 hover:text-white/80"
              }`}
            >
              <span className="relative z-10 px-3 py-2">Profile</span>
              <span
                className={`absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-violet-500 to-purple-500 transition-transform duration-300 ease-out origin-left ${
                  pathname === "/user/profile" ? "scale-x-100 shadow-[0_0_8px_rgba(139,92,246,0.5)]" : "scale-x-0 group-hover:scale-x-100"
                }`}
              />
            </Link>
            <Link
              href="/user/settings"
              className={`group relative inline-flex items-center shrink-0 text-[11px] font-medium uppercase leading-none tracking-wide transition-colors duration-300 ${
                pathname === "/user/settings"
                  ? "text-white"
                  : "text-white/60 hover:text-white/80"
              }`}
            >
              <span className="relative z-10 px-3 py-2">Settings</span>
              <span
                className={`absolute bottom-0 left-0 h-[2px] w-full bg-gradient-to-r from-violet-500 to-purple-500 transition-transform duration-300 ease-out origin-left ${
                  pathname === "/user/settings" ? "scale-x-100 shadow-[0_0_8px_rgba(139,92,246,0.5)]" : "scale-x-0 group-hover:scale-x-100"
                }`}
              />
            </Link>
          </div>

          {/* Logout button */}
          <button
            onClick={handleLogout}
            aria-label="Log out"
            title="Log out"
            className="hidden lg:inline-flex shrink-0 items-center justify-center rounded-full p-2 text-white/60 transition-colors hover:bg-white/10 hover:text-white ml-1"
          >
            <LogOut className="h-4 w-4" />
          </button>

          {/* Mobile menu button */}
          <div className="ml-auto flex justify-end transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] relative z-10 opacity-100 translate-y-0 pointer-events-auto lg:hidden">
            <button
              className="w-10 h-10 flex flex-col items-center justify-center gap-1.5 focus:outline-none relative pointer-events-auto transition-all duration-500 rounded-full backdrop-blur-xl backdrop-saturate-150 border bg-white/10 border-white/20"
              aria-label="Toggle Menu"
            >
              <span className="w-5 h-[2px] transition-all duration-300 ease-out origin-center bg-white" />
              <span className="w-5 h-[2px] transition-all duration-300 ease-out origin-center bg-white" />
            </button>
          </div>
        </nav>
      </header>

      {/* Mobile top bar - Liquid Glass */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-white/20 bg-gradient-to-r from-white/10 via-white/5 to-white/10 px-4 py-3 backdrop-blur-2xl backdrop-saturate-150 lg:hidden shadow-lg shadow-black/20">
        <Link
          href="/user/dashboard"
          className="flex items-center gap-2 text-base font-bold text-white transition-all duration-300 hover:scale-105"
        >
          <div className="relative flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-red-500/30 to-red-600/20 backdrop-blur-md ring-1 ring-white/30 shadow-inner shadow-white/10">
            <HeartPulse className="h-5 w-5 text-red-400 drop-shadow-[0_0_8px_rgba(248,113,113,0.6)]" />
          </div>
          <span className="bg-gradient-to-r from-white via-white/90 to-white/70 bg-clip-text text-transparent drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]">
            Pulse Link
          </span>
        </Link>
        <div className="flex items-center gap-1.5">
          <Link
            href="/user/settings"
            className={`group relative rounded-xl p-2.5 transition-all duration-300 ${
              pathname === "/user/settings"
                ? "bg-white/20 text-white shadow-[inset_0_0_20px_rgba(255,255,255,0.1)] ring-1 ring-white/40"
                : "bg-white/5 text-white/60 hover:bg-white/15 hover:text-white hover:shadow-[0_0_20px_rgba(255,255,255,0.1)] ring-1 ring-white/20 hover:ring-white/30"
            }`}
            aria-label="Settings"
          >
            <Settings className="h-5 w-5 transition-transform duration-500 group-hover:rotate-90" />
          </Link>
          <Link
            href="/user/profile"
            className={`group relative rounded-xl p-2.5 transition-all duration-300 ${
              pathname === "/user/profile"
                ? "bg-white/20 text-white shadow-[inset_0_0_20px_rgba(255,255,255,0.1)] ring-1 ring-white/40"
                : "bg-white/5 text-white/60 hover:bg-white/15 hover:text-white hover:shadow-[0_0_20px_rgba(255,255,255,0.1)] ring-1 ring-white/20 hover:ring-white/30"
            }`}
            aria-label="Profile"
          >
            <User className="h-5 w-5" />
          </Link>
          <button
            onClick={handleLogout}
            className="group relative rounded-xl p-2.5 bg-white/5 text-white/60 transition-all duration-300 hover:bg-red-500/20 hover:text-red-400 hover:shadow-[0_0_20px_rgba(248,113,113,0.2)] ring-1 ring-white/20 hover:ring-red-400/40"
            aria-label="Log out"
          >
            <LogOut className="h-5 w-5 transition-transform duration-300 group-hover:-translate-x-0.5" />
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto px-4 pb-28 pt-8 sm:px-6 lg:px-10 lg:pb-10 lg:pt-28">
        <PageTransition>
          {children}
        </PageTransition>
      </main>

      {/* Mobile bottom navigation - Liquid Glass */}
      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-white/20 bg-gradient-to-t from-white/15 via-white/8 to-white/5 backdrop-blur-2xl backdrop-saturate-150 lg:hidden shadow-[0_-8px_32px_rgba(0,0,0,0.3)]">
        {mobileNav.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`group relative flex flex-col items-center justify-center gap-1 py-3 text-[10px] font-medium transition-all duration-300 ${
                active
                  ? "text-white"
                  : "text-white/50 hover:text-white/80"
              }`}
            >
              {/* Active state glass pill background */}
              {active && (
                <div className="absolute inset-0 mx-2 rounded-xl bg-gradient-to-t from-violet-600/30 to-violet-400/20 backdrop-blur-md ring-1 ring-white/30 shadow-[inset_0_0_20px_rgba(139,92,246,0.2),0_0_15px_rgba(139,92,246,0.3)]" />
              )}
              {/* Icon with glow when active */}
              <div className="relative z-10">
                <item.icon
                  className={`h-5 w-5 transition-all duration-300 ${
                    active
                      ? "text-violet-300 drop-shadow-[0_0_8px_rgba(139,92,246,0.6)] scale-110"
                      : "group-hover:scale-105"
                  }`}
                />
                {/* Active indicator dot */}
                {active && (
                  <div className="absolute -bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-violet-400 shadow-[0_0_6px_rgba(139,92,246,0.8)]" />
                )}
              </div>
              {/* Label with gradient when active */}
              <span
                className={`relative z-10 text-[10px] transition-all duration-300 ${
                  active
                    ? "bg-gradient-to-t from-violet-200 to-white bg-clip-text text-transparent drop-shadow-[0_0_4px_rgba(139,92,246,0.4)]"
                    : ""
                }`}
              >
                {item.name}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* AI Health Companion Chatbot */}
      <HealthCompanionBubble />
    </KioskScreen>
  );
}
