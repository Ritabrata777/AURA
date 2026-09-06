"use client";

import { glassCard } from "../kiosk";

/**
 * Skeleton loader for the ECG monitor page.
 * Shows a shimmering placeholder that matches the page layout.
 */
export function EcgMonitorSkeleton() {
  return (
    <div className="mx-auto max-w-5xl animate-pulse">
      {/* Header */}
      <div className="mb-6">
        <div className="h-8 w-48 rounded bg-white/10" />
        <div className="mt-2 h-4 w-80 rounded bg-white/10" />
      </div>

      {/* Waveform card */}
      <div className={`${glassCard} p-4 mb-8`}>
        <div className="h-56 sm:h-72 rounded-lg bg-white/5" />
        
        {/* Stats row */}
        <div className="mt-4 flex flex-wrap gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-6 w-24 rounded bg-white/10" />
          ))}
        </div>

        {/* Controls */}
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-white/10 pt-4">
          <div className="h-10 w-40 rounded-lg bg-white/10" />
          <div className="h-10 w-32 rounded-lg bg-white/10" />
        </div>
      </div>

      {/* History section */}
      <div className="mt-8">
        <div className="mb-4 h-6 w-40 rounded bg-white/10" />
        <div className={`${glassCard} p-4`}>
          {[...Array(3)].map((_, i) => (
            <div key={i} className="mb-3 flex items-center gap-4">
              <div className="h-4 flex-1 rounded bg-white/10" />
              <div className="h-4 w-20 rounded bg-white/10" />
              <div className="h-8 w-16 rounded bg-white/10" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Skeleton loader for the dashboard page.
 */
export function DashboardSkeleton() {
  return (
    <div className="mx-auto max-w-6xl animate-pulse">
      {/* Header */}
      <div className="mb-6">
        <div className="h-8 w-64 rounded bg-white/10" />
        <div className="mt-2 h-4 w-96 rounded bg-white/10" />
      </div>

      {/* ECG Monitor */}
      <div className={`${glassCard} p-4 mb-6`}>
        <div className="mb-4 flex items-center justify-between">
          <div className="h-6 w-32 rounded bg-white/10" />
          <div className="h-4 w-20 rounded bg-white/10" />
        </div>
        <div className="h-48 sm:h-56 rounded-lg bg-white/5" />
      </div>

      {/* Vitals grid */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className={`${glassCard} p-4`}>
            <div className="mb-2 flex items-center gap-2">
              <div className="h-5 w-5 rounded bg-white/10" />
              <div className="h-4 w-24 rounded bg-white/10" />
            </div>
            <div className="h-8 w-32 rounded bg-white/10" />
            <div className="mt-2 h-3 w-40 rounded bg-white/10" />
          </div>
        ))}
      </div>

      {/* Devices section */}
      <div className="mt-8">
        <div className="mb-4 h-6 w-40 rounded bg-white/10" />
        <div className={`${glassCard} p-4`}>
          {[...Array(2)].map((_, i) => (
            <div key={i} className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded bg-white/10" />
                <div className="h-4 w-32 rounded bg-white/10" />
              </div>
              <div className="h-6 w-20 rounded bg-white/10" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Generic skeleton card for custom layouts.
 */
export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className={`${glassCard} p-4 animate-pulse`}>
      <div className="mb-4 h-5 w-32 rounded bg-white/10" />
      {[...Array(lines)].map((_, i) => (
        <div
          key={i}
          className={`mb-2 h-4 rounded bg-white/10 ${
            i === lines - 1 ? "w-2/3" : "w-full"
          }`}
        />
      ))}
    </div>
  );
}

/**
 * Simple shimmer line for text placeholders.
 */
export function SkeletonLine({ className = "" }: { className?: string }) {
  return <div className={`h-4 rounded bg-white/10 animate-pulse ${className}`} />;
}
