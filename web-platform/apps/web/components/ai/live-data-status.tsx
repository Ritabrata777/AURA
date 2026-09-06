"use client";

import { Wifi, WifiOff, Clock } from "lucide-react";

interface LiveDataStatusProps {
  deviceOnline?: boolean;
  healthContext?: {
    device: {
      online: boolean;
      lastSeen: string | null;
    };
  } | null;
}

export function LiveDataStatus({ deviceOnline, healthContext }: LiveDataStatusProps) {
  const isOnline = deviceOnline || healthContext?.device?.online || false;
  const lastSeen = healthContext?.device?.lastSeen;

  const getStatusInfo = () => {
    if (isOnline) {
      return {
        icon: Wifi,
        text: "Live data connected",
        color: "text-emerald-300",
        dotColor: "bg-emerald-400",
      };
    } else if (lastSeen) {
      const timeDiff = Date.now() - new Date(lastSeen).getTime();
      const minutesAgo = Math.floor(timeDiff / 60000);
      
      if (minutesAgo < 5) {
        return {
          icon: Clock,
          text: "Waiting for recent readings",
          color: "text-amber-300",
          dotColor: "bg-amber-400",
        };
      }
    }
    
    return {
      icon: WifiOff,
      text: "Device offline",
      color: "text-red-300",
      dotColor: "bg-red-400",
    };
  };

  const status = getStatusInfo();
  const StatusIcon = status.icon;

  return (
    <div className="relative flex items-center gap-2 px-4 py-2 bg-black/30 border-b border-white/10">
      <div className="flex items-center gap-2 flex-1">
        <span className={`h-2 w-2 rounded-full ${status.dotColor} animate-pulse`}></span>
        <StatusIcon className={`h-3.5 w-3.5 ${status.color}`} />
        <span className={`text-xs font-medium ${status.color}`}>{status.text}</span>
      </div>
      
      {lastSeen && !isOnline && (
        <span className="text-xs text-white/40">
          Last seen {new Date(lastSeen).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      )}
    </div>
  );
}
