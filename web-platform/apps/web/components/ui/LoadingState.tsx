"use client";

import { glassCard, InnerGlow } from "../kiosk";

export function LoadingState({ message = "Loading..." }: { message?: string }) {
  return (
    <div className={`${glassCard} p-12 text-center`}>
      <InnerGlow />
      <div className="relative animate-spin rounded-full h-10 w-10 border-2 border-violet-400 border-t-transparent mx-auto mb-4" />
      <p className="relative text-sm text-white/50">{message}</p>
    </div>
  );
}

export function LoadingSpinner({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const sizes = {
    sm: "h-4 w-4 border",
    md: "h-8 w-8 border-2",
    lg: "h-12 w-12 border-2",
  };

  return (
    <div
      className={`animate-spin border-white/70 border-t-transparent ${sizes[size]}`}
    />
  );
}
