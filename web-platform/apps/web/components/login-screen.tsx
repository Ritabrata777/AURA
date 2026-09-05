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
        await login(email, password);
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
    <KioskScreen className="flex items-center justify-center p-4">
      <motion.div layout className={`${glassPanel} w-full max-w-md p-8`}>
        <InnerGlow />
        <motion.div layout className="mb-6 flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full border border-white/20 bg-white/10 shadow-[0_0_20px_rgba(255,255,255,0.1)]">
            <ShieldCheck size={32} className="text-white" />
          </div>
        </motion.div>

        <motion.h1 layout className="mb-2 text-center text-2xl font-bold tracking-tight">
          AURA
        </motion.h1>
        <motion.p layout className="mb-8 text-center text-sm text-white/50">
          Select your role to access the platform
        </motion.p>

        <motion.div layout className="mb-6 grid grid-cols-3 gap-3">
          <button
            type="button"
            onClick={() => setRole("PATIENT")}
            className={`flex flex-col items-center gap-2 rounded-2xl border-2 p-3 transition-all ${
              role === "PATIENT"
                ? "border-violet-500 bg-violet-500/10 text-violet-400 shadow-[0_0_15px_rgba(139,92,246,0.2)]"
                : "border-white/10 bg-white/5 text-white/60 hover:border-white/30"
            }`}
          >
            <User size={24} />
            <span className="text-xs font-bold">Patient</span>
          </button>

          <button
            type="button"
            onClick={() => setRole("DOCTOR")}
            className={`flex flex-col items-center gap-2 rounded-2xl border-2 p-3 transition-all ${
              role === "DOCTOR"
                ? "border-green-500 bg-green-500/10 text-green-500 shadow-[0_0_15px_rgba(34,197,94,0.2)]"
                : "border-white/10 bg-white/5 text-white/60 hover:border-white/30"
            }`}
          >
            <Stethoscope size={24} />
            <span className="text-xs font-bold">Doctor</span>
          </button>

          <button
            type="button"
            onClick={() => setRole("INDIVIDUAL_USER")}
            className={`flex flex-col items-center gap-2 rounded-2xl border-2 p-3 transition-all ${
              role === "INDIVIDUAL_USER"
                ? "border-purple-500 bg-purple-500/10 text-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.2)]"
                : "border-white/10 bg-white/5 text-white/60 hover:border-white/30"
            }`}
          >
            <ShieldCheck size={24} />
            <span className="text-xs font-bold">Personal</span>
          </button>
        </motion.div>

        <div className="relative min-h-[120px]">
          <AnimatePresence mode="wait">
            {role ? (
              <motion.div
                key="form"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex flex-col gap-4"
              >
                <div className="flex rounded-xl border border-white/10 bg-black/40 p-1">
                  <button
                    type="button"
                    onClick={() => {
                      setMode("login");
                      setError(null);
                    }}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-bold transition-all ${
                      mode === "login" ? "bg-white/15 text-white shadow-md" : "text-white/40 hover:text-white/70"
                    }`}
                  >
                    <LogIn size={16} /> Existing
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMode("register");
                      setError(null);
                    }}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-bold transition-all ${
                      mode === "register"
                        ? "bg-white/15 text-white shadow-md"
                        : "text-white/40 hover:text-white/70"
                    }`}
                  >
                    <UserPlus size={16} /> New
                  </button>
                </div>

                <form onSubmit={submit} className="flex flex-col gap-4">
                  <div className="relative">
                    <Mail size={18} className="absolute top-1/2 left-4 -translate-y-1/2 text-white/40" />
                    <input
                      type="email"
                      placeholder={role === "DOCTOR" ? "Clinician email" : role === "INDIVIDUAL_USER" ? "Your email" : "Patient email"}
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      autoComplete="email"
                      required
                      className="w-full rounded-xl border border-white/20 bg-black/40 py-3 pr-4 pl-12 text-white transition-colors focus:border-violet-500 focus:outline-none"
                    />
                  </div>

                  <div className="relative">
                    <Lock size={18} className="absolute top-1/2 left-4 -translate-y-1/2 text-white/40" />
                    <input
                      type="password"
                      placeholder={mode === "register" ? "Password (8+ characters)" : "Password"}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      autoComplete={mode === "login" ? "current-password" : "new-password"}
                      minLength={8}
                      required
                      className="w-full rounded-xl border border-white/20 bg-black/40 py-3 pr-4 pl-12 text-white tracking-widest transition-colors focus:border-violet-500 focus:outline-none"
                    />
                  </div>

                  {error ? <p className="text-sm text-red-400">{error}</p> : null}

                  <button
                    type="submit"
                    disabled={!isFormValid || submitting}
                    className={`mt-2 flex w-full items-center justify-center gap-2 rounded-xl py-3 font-bold transition-all ${
                      isFormValid && !submitting
                        ? role === "DOCTOR"
                          ? "bg-green-500 text-black shadow-[0_0_15px_rgba(34,197,94,0.4)] hover:bg-green-400"
                          : role === "INDIVIDUAL_USER"
                          ? "bg-purple-600 text-white shadow-[0_0_15px_rgba(168,85,247,0.4)] hover:bg-purple-500"
                          : "bg-violet-600 text-white shadow-[0_0_15px_rgba(124,58,237,0.4)] hover:bg-violet-500"
                        : "cursor-not-allowed bg-white/10 text-white/40"
                    }`}
                  >
                    {submitting ? (
                      <Loader2 size={18} className="animate-spin" />
                    ) : (
                      <>
                        {mode === "register" ? "Create Account" : "Access Platform"} <ArrowRight size={18} />
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
                className="absolute inset-0 flex items-center justify-center rounded-xl border border-dashed border-white/10 bg-white/5 text-center text-sm text-white/40"
              >
                Select a role above to reveal login options.
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </KioskScreen>
  );
}
