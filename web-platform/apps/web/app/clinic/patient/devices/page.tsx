"use client";

import { DevicePanel } from "@/components/device-panel";
import { LoadingState } from "@/components/ui/LoadingState";
import { useClinicPatient } from "@/components/clinic/patient-provider";

export default function ClinicPatientDevices() {
  const {
    loading,
    devices,
    deviceStatuses,
    deviceEvents,
    lastAck,
    busyDeviceId,
    activeSession,
    sendCommand,
    unpairDevice,
    pairDevice,
  } = useClinicPatient();

  if (loading) {
    return <LoadingState message="Loading your devices…" />;
  }

  return (
    <>
      <h1 className="text-2xl font-bold text-white">Your devices</h1>
      <DevicePanel
        devices={devices}
        statuses={deviceStatuses}
        lastAck={lastAck}
        events={deviceEvents}
        busyDeviceId={busyDeviceId}
        activeSessionDeviceId={activeSession?.deviceId ?? null}
        onCommand={(deviceId, command, duration) => {
          void sendCommand(deviceId, command, duration);
        }}
        onUnpair={(deviceId) => {
          void unpairDevice(deviceId);
        }}
        onPair={pairDevice}
      />
    </>
  );
}
