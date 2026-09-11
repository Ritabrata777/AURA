"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  Loader2,
  Lock,
  LogIn,
  Mail,
  ShieldCheck,
  Stethoscope,
  User,
  UserPlus,
} from "lucide-react";
import { useAuth } from "../lib/auth";
import { glassPanel, InnerGlow, KioskScreen } from "./kiosk";

type Mode = "login" | "register";

export function LoginScreen() {
  const { login, register } = useAuth();

  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"PATIENT" | "DOCTOR" | "INDIVIDUAL_USER" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isFormValid =
    email.includes("@") && password.length >= 8 && (mode === "login" || role !== null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isFormValid) return;

    setSubmitting(true);
    setError(null);

    try {
      if (mode === "login") {
        await login(email, password, role!);
      } else if (role) {
        await register(email, password, role);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KioskScreen className="flex min-h-screen items-center justify-center p-4 sm:p-6">
      <motion.div layout className={`${glassPanel} w-full max-w-md p-5 sm:p-8`}>
        <InnerGlow />
        <motion.div layout className="mb-6 flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full border border-white/20 bg-white/10 shadow-[0_0_20px_rgba(255,255,255,0.1)]">
            <ShieldCheck size={32} className="text-white" />
          </div>
        </motion.div>

        <motion.h1 layout className="mb-2 text-center text-2xl font-bold tracking-tight sm:text-3xl">
          Pulse Link
        </motion.h1>
        <motion.p layout className="mb-6 text-center text-xs text-white/50 sm:mb-8 sm:text-sm">
          Select your role to continue
        </motion.p>

        <motion.div layout className="mb-6 grid grid-cols-3 gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => setRole("PATIENT")}
            className={`group flex flex-col items-center justify-center gap-2 rounded-2xl border-2 p-2 sm:p-4 transition-all min-h-[90px] sm:min-h-[100px] active:scale-95 ${
              role === "PATIENT"
                ? "border-violet-500 bg-violet-500/20 text-violet-300 shadow-[0_0_20px_rgba(139,92,246,0.3)]"
                : "border-white/10 bg-white/5 text-white/70 hover:border-white/30 hover:bg-white/10"
            }`}
          >
            <User size={24} className={`sm:w-7 sm:h-7 ${role === "PATIENT" ? "text-violet-400" : ""}`} />
            <span className="text-[11px] sm:text-sm font-semibold">{role === "PATIENT" ? "✓ Patient" : "Patient"}</span>
          </button>

          <button
            type="button"
            onClick={() => setRole("DOCTOR")}
            className={`group flex flex-col items-center justify-center gap-2 rounded-2xl border-2 p-2 sm:p-4 transition-all min-h-[90px] sm:min-h-[100px] active:scale-95 ${
              role === "DOCTOR"
                ? "border-green-500 bg-green-500/20 text-green-300 shadow-[0_0_20px_rgba(34,197,94,0.3)]"
                : "border-white/10 bg-white/5 text-white/70 hover:border-white/30 hover:bg-white/10"
            }`}
          >
            <Stethoscope size={24} className={`sm:w-7 sm:h-7 ${role === "DOCTOR" ? "text-green-400" : ""}`} />
            <span className="text-[11px] sm:text-sm font-semibold">{role === "DOCTOR" ? "✓ Doctor" : "Doctor"}</span>
          </button>

          <button
            type="button"
            onClick={() => setRole("INDIVIDUAL_USER")}
            className={`group flex flex-col items-center justify-center gap-2 rounded-2xl border-2 p-2 sm:p-4 transition-all min-h-[90px] sm:min-h-[100px] active:scale-95 ${
              role === "INDIVIDUAL_USER"
                ? "border-purple-500 bg-purple-500/20 text-purple-300 shadow-[0_0_20px_rgba(168,85,247,0.3)]"
                : "border-white/10 bg-white/5 text-white/70 hover:border-white/30 hover:bg-white/10"
            }`}
          >
            <ShieldCheck size={24} className={`sm:w-7 sm:h-7 ${role === "INDIVIDUAL_USER" ? "text-purple-400" : ""}`} />
            <span className="text-[11px] sm:text-sm font-semibold">{role === "INDIVIDUAL_USER" ? "✓ Personal" : "Personal"}</span>
          </button>
        </motion.div>

        <div className="relative min-h-[290px] sm:min-h-[320px]">
          <AnimatePresence mode="wait">
            {role ? (
              <motion.div
                key="form"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex flex-col gap-3 sm:gap-4"
              >
                {/* Role badge */}
                <div className="flex items-center justify-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                      role === "DOCTOR"
                        ? "bg-green-500/20 text-green-400"
                        : role === "INDIVIDUAL_USER"
                        ? "bg-purple-500/20 text-purple-400"
                        : "bg-violet-500/20 text-violet-400"
                    }`}
                  >
                    {role === "DOCTOR" ? (
                      <Stethoscope size={12} />
                    ) : role === "INDIVIDUAL_USER" ? (
                      <ShieldCheck size={12} />
                    ) : (
                      <User size={12} />
                    )}
                    {role === "DOCTOR" ? "Doctor" : role === "INDIVIDUAL_USER" ? "Personal User" : "Patient"}
                  </span>
                </div>

                {/* Login/Register toggle */}
                <div className="flex rounded-xl border border-white/10 bg-black/40 p-1">
                  <button
                    type="button"
                    onClick={() => {
                      setMode("login");
                      setError(null);
                    }}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-xs sm:text-sm font-bold transition-all active:scale-95 ${
                      mode === "login"
                        ? "bg-white/15 text-white shadow-md"
                        : "text-white/40 hover:text-white/70"
                    }`}
                  >
                    <LogIn size={16} /> Login
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMode("register");
                      setError(null);
                    }}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-xs sm:text-sm font-bold transition-all active:scale-95 ${
                      mode === "register"
                        ? "bg-white/15 text-white shadow-md"
                        : "text-white/40 hover:text-white/70"
                    }`}
                  >
                    <UserPlus size={16} /> Sign Up
                  </button>
                </div>

                <form onSubmit={submit} className="flex flex-col gap-3 sm:gap-4">
                  {/* Email input */}
                  <div className="relative">
                    <Mail size={18} className="absolute top-1/2 left-3.5 -translate-y-1/2 text-white/40" />
                    <input
                      type="email"
                      placeholder={role === "DOCTOR" ? "Clinician email" : role === "INDIVIDUAL_USER" ? "Your email" : "Patient email"}
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      autoComplete="email"
                      required
                      className="w-full rounded-xl border border-white/20 bg-black/40 py-3.5 pr-4 pl-11 text-sm text-white transition-colors placeholder:text-white/30 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500/50 active:bg-black/60 sm:py-4 sm:pl-12"
                    />
                  </div>

                  {/* Password input */}
                  <div className="relative">
                    <Lock size={18} className="absolute top-1/2 left-3.5 -translate-y-1/2 text-white/40" />
                    <input
                      type="password"
                      placeholder={mode === "register" ? "Create password (8+ chars)" : "Enter password"}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      autoComplete={mode === "login" ? "current-password" : "new-password"}
                      minLength={8}
                      required
                      className="w-full rounded-xl border border-white/20 bg-black/40 py-3.5 pr-4 pl-11 text-sm text-white tracking-widest transition-colors placeholder:text-white/30 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500/50 active:bg-black/60 sm:py-4 sm:pl-12"
                    />
                  </div>

                  {error && (
                    <motion.div
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400"
                    >
                      {error}
                    </motion.div>
                  )}

                  {/* Submit button */}
                  <button
                    type="submit"
                    disabled={!isFormValid || submitting}
                    className={`mt-1 flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold transition-all active:scale-98 disabled:active:scale-100 sm:py-4 ${
                      isFormValid && !submitting
                        ? role === "DOCTOR"
                          ? "bg-green-500 text-black shadow-[0_0_20px_rgba(34,197,94,0.4)] hover:bg-green-400"
                          : role === "INDIVIDUAL_USER"
                          ? "bg-purple-600 text-white shadow-[0_0_20px_rgba(168,85,247,0.4)] hover:bg-purple-500"
                          : "bg-violet-600 text-white shadow-[0_0_20px_rgba(124,58,237,0.4)] hover:bg-violet-500"
                        : "cursor-not-allowed bg-white/10 text-white/40"
                    }`}
                  >
                    {submitting ? (
                      <Loader2 size={18} className="animate-spin" />
                    ) : (
                      <>
                        {mode === "register" ? "Create Account" : "Continue"}{" "}
                        <ArrowRight size={18} />
                      </>
                    )}
                  </button>
                </form>
              </motion.div>
            ) : (
              <motion.div
                key="prompt"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 flex items-center justify-center rounded-xl border border-dashed border-white/10 bg-white/5 text-center text-xs text-white/40 p-6 sm:text-sm"
              >
                Select a role above to continue
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <p className="mt-6 text-center text-[11px] leading-relaxed text-white/35">
          Prototype measurements — not a medical diagnosis. In an emergency call local
          emergency services.
          <br />
          <a href="/safety" className="underline hover:text-white/60">Safety</a>
          {" · "}
          <a href="/terms" className="underline hover:text-white/60">Terms</a>
          {" · "}
          <a href="/privacy" className="underline hover:text-white/60">Privacy</a>
        </p>
      </motion.div>
    </KioskScreen>
  );
}
