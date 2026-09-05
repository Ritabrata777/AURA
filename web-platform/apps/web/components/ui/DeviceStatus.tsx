"use client";

import { Wifi, WifiOff, Clock, Zap } from "lucide-react";
import { glassCard, InnerGlow } from "../kiosk";
import type { DeviceSummary } from "@/lib/types";

interface DeviceStatusProps {
  device: DeviceSummary;
}

export function DeviceStatus({ device }: DeviceStatusProps) {
  const lastSeen = device.lastSeenAt
    ? new Date(device.lastSeenAt)
    : null;

  const minutesAgo = lastSeen
    ? Math.floor((Date.now() - lastSeen.getTime()) / 60000)
    : null;

  return (
    <div className={`${glassCard} p-6`}>
      <InnerGlow />
      <div className="relative flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-white">
            Device {device.hardwareId}
          </h3>
          <p className="text-sm text-white/50 mt-1 font-mono">
            Pairing code: {device.pairingCode}
          </p>
        </div>
        <div className="flex items-center">
          {device.online ? (
            <>
              <Wifi className="h-5 w-5 text-emerald-400 mr-2" />
              <span className="text-sm font-medium text-emerald-400">Online</span>
            </>
          ) : (
            <>
              <WifiOff className="h-5 w-5 text-white/40 mr-2" />
              <span className="text-sm font-medium text-white/50">Offline</span>
            </>
          )}
        </div>
      </div>

      <div className="relative flex items-center text-sm text-white/60">
        <Clock className="h-4 w-4 mr-2 text-white/40" />
        {lastSeen ? (
          <span>
            {minutesAgo === 0
              ? "Just now"
              : minutesAgo === 1
              ? "1 minute ago"
              : minutesAgo !== null && minutesAgo < 60
              ? `${minutesAgo} minutes ago`
              : lastSeen.toLocaleString()}
          </span>
        ) : (
          <span>Never seen</span>
        )}
      </div>

      <div className="relative flex items-center text-sm text-white/60 mt-2">
        <Zap className="h-4 w-4 mr-2 text-white/40" />
        <span>Paired {new Date(device.pairedAt).toLocaleDateString()}</span>
      </div>
    </div>
  );
}
