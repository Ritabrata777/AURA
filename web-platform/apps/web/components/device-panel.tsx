"use client";

import { useState } from "react";
import type {
  DeviceSummary,
  LiveCommandAck,
  LiveDeviceEvent,
  LiveDeviceStatus,
} from "../lib/types";
import { formatRelative } from "../lib/format";
import { glassPanel, InnerGlow } from "./kiosk";

const ECG_DURATIONS = [30, 60, 300];
const EVENTS_PER_DEVICE = 3;

export interface DevicePanelProps {
  devices: DeviceSummary[];
  statuses: Record<string, LiveDeviceStatus | undefined>;
  lastAck: LiveCommandAck | null;
  events: LiveDeviceEvent[];
  busyDeviceId: string | null;
  activeSessionDeviceId: string | null;
  onCommand: (deviceId: string, command: string, durationSeconds?: number) => void;
  onUnpair: (deviceId: string) => void;
  onPair: (pairingCode: string) => Promise<void>;
}

export function DevicePanel({
  devices,
  statuses,
  lastAck,
  events,
  busyDeviceId,
  activeSessionDeviceId,
  onCommand,
  onUnpair,
  onPair,
}: DevicePanelProps) {
  const [pairingCode, setPairingCode] = useState("");
  const [pairError, setPairError] = useState<string | null>(null);
  const [pairing, setPairing] = useState(false);

  const submitPairing = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!pairingCode.trim()) return;

    setPairing(true);
    setPairError(null);
    try {
      await onPair(pairingCode.trim());
      setPairingCode("");
    } catch (error) {
      setPairError(error instanceof Error ? error.message : "Pairing failed");
    } finally {
      setPairing(false);
    }
  };

  return (
    <article className={`${glassPanel} p-6`} id="device">
      <InnerGlow />
      <div className="mb-4">
        <p className="text-[11px] font-bold tracking-wider text-white/50 uppercase">Hardware</p>
        <h2 className="text-lg font-bold">Your devices</h2>
      </div>

      {devices.length === 0 ? (
        <p className="text-sm text-white/50">
          No device paired yet. Enter the pairing code printed on your monitor below.
        </p>
      ) : null}

      {devices.map((device) => {
        const status = statuses[device.deviceId];
        const online = status ? status.wifiConnected && status.mqttConnected : device.online;
        const busy = busyDeviceId === device.deviceId;
        const recording = activeSessionDeviceId === device.deviceId;
        const deviceEvents = events
          .filter((event) => event.deviceId === device.deviceId)
          .slice(0, EVENTS_PER_DEVICE);

        return (
          <div className="mt-4 rounded-2xl border border-white/10 bg-black/30 p-4" key={device.deviceId}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <strong className="block">{device.hardwareId}</strong>
                <small className="text-[11px] text-white/50">
                  {online ? "Online" : "Offline"} · last seen{" "}
                  {formatRelative(status?.timestamp ?? device.lastSeenAt)}
                </small>
              </div>
              <button
                className="text-xs font-bold text-red-400 hover:text-red-300 disabled:opacity-40"
                onClick={() => onUnpair(device.deviceId)}
                disabled={busy}
              >
                Unpair
              </button>
            </div>

            {status ? (
              <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-white/50">
                <span>Firmware {status.firmwareVersion}</span>
                <span>Uptime {Math.floor(status.uptimeSeconds / 60)}m</span>
                <span>{Math.round(status.freeHeap / 1024)} KB free</span>
                {status.timeSynced ? null : <span className="text-orange-400">Clock not synced</span>}
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-2">
              {recording ? (
                <button
                  className="rounded-xl bg-red-500/80 px-3 py-2 text-xs font-bold text-white disabled:opacity-40"
                  onClick={() => onCommand(device.deviceId, "STOP_ECG")}
                  disabled={busy || !online}
                >
                  Stop ECG
                </button>
              ) : (
                ECG_DURATIONS.map((seconds) => (
                  <button
                    key={seconds}
                    className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-bold hover:bg-white/10 disabled:opacity-40"
                    onClick={() => onCommand(device.deviceId, "START_ECG", seconds)}
                    disabled={busy || !online}
                    title={`Record a ${seconds}-second ECG`}
                  >
                    ECG {seconds < 60 ? `${seconds}s` : `${seconds / 60}m`}
                  </button>
                ))
              )}

              <button
                className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-bold hover:bg-white/10 disabled:opacity-40"
                onClick={() => onCommand(device.deviceId, "START_SPO2")}
                disabled={busy || !online}
              >
                Read SpO₂
              </button>
              <button
                className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-bold hover:bg-white/10 disabled:opacity-40"
                onClick={() => onCommand(device.deviceId, "START_TEMPERATURE")}
                disabled={busy || !online}
              >
                Read temp
              </button>
              <button
                className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-bold hover:bg-white/10 disabled:opacity-40"
                onClick={() => onCommand(device.deviceId, "GET_STATUS")}
                disabled={busy || !online}
              >
                Refresh status
              </button>
            </div>

            {!online ? (
              <p className="mt-3 text-xs text-white/40">Commands are disabled while the device is offline.</p>
            ) : null}

            {lastAck && lastAck.deviceId === device.deviceId ? (
              <p className={`mt-3 text-xs font-semibold ${lastAck.status === "REJECTED" ? "text-red-400" : "text-green-400"}`}>
                {lastAck.command} · {lastAck.status}
                {lastAck.errorCode ? ` (${lastAck.errorCode})` : ""}
              </p>
            ) : null}

            {deviceEvents.length > 0 ? (
              <ul className="mt-3 grid gap-2 border-t border-dashed border-white/10 pt-3">
                {deviceEvents.map((event) => (
                  <li
                    key={`${event.code}-${event.timestamp}`}
                    className="flex items-baseline gap-2 text-[11px] text-white/50"
                  >
                    <span className="font-bold whitespace-nowrap">{event.code.replace(/_/g, " ").toLowerCase()}</span>
                    <span className="flex-1 text-white/80">{event.message}</span>
                    <span className="whitespace-nowrap">{formatRelative(event.timestamp)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        );
      })}

      <form className="mt-6 border-t border-white/10 pt-5" onSubmit={submitPairing}>
        <label htmlFor="pairing-code" className="mb-2 block text-xs font-bold text-white/50">
          Pair a new device
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id="pairing-code"
            value={pairingCode}
            onChange={(event) => setPairingCode(event.target.value)}
            placeholder="Pairing code"
            autoComplete="off"
            className="flex-1 rounded-xl border border-white/20 bg-black/40 px-3 py-2 text-sm text-white focus:border-violet-500 focus:outline-none"
          />
          <button
            className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
            type="submit"
            disabled={pairing || !pairingCode.trim()}
          >
            {pairing ? "Pairing…" : "Pair"}
          </button>
        </div>
        {pairError ? <p className="mt-2 text-sm text-red-400">{pairError}</p> : null}
      </form>
    </article>
  );
}
