"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { useAuth, useApi } from "@/lib/auth";
import { queryString } from "@/lib/api";
import { useLiveFeed, type LiveFeed } from "@/lib/live";
import type {
  CommandResult,
  DeviceSummary,
  DoctorLink,
  EcgSessionSummary,
  LiveCommandAck,
  LiveDeviceEvent,
  LiveDeviceStatus,
  LiveEcgChunk,
  LiveMeasurement,
  Measurement,
  MeasurementType,
  TrendPoint,
  VitalSummary,
} from "@/lib/types";

const MAX_LIVE_HISTORY = 25;

export interface ActiveEcgSession {
  sessionId: string;
  deviceId: string;
  sampleRate: number;
}

interface ClinicPatientContextValue {
  user: { email: string; id: string };
  loading: boolean;
  error: string | null;
  notice: string | null;
  summaries: VitalSummary[];
  measurements: Measurement[];
  devices: DeviceSummary[];
  sessions: EcgSessionSummary[];
  doctors: DoctorLink[];
  pendingDoctors: DoctorLink[];
  trend: TrendPoint[];
  trendType: MeasurementType;
  setTrendType: (type: MeasurementType) => void;
  liveVitals: Partial<
    Record<MeasurementType, { value: number; unit: string; measuredAt: string }>
  >;
  ecgChunk: LiveEcgChunk | null;
  activeSession: ActiveEcgSession | null;
  deviceStatuses: Record<string, LiveDeviceStatus | undefined>;
  deviceEvents: LiveDeviceEvent[];
  lastAck: LiveCommandAck | null;
  live: LiveFeed;
  busyDeviceId: string | null;
  busyDoctorId: string | null;
  activeTest: string | null;
  setActiveTest: (id: string | null) => void;
  primaryDevice: DeviceSummary | null;
  primaryOnline: boolean;
  onlineCount: number;
  runTest: (id: string) => void;
  sendCommand: (deviceId: string, command: string, durationSeconds?: number) => Promise<void>;
  pairDevice: (pairingCode: string) => Promise<void>;
  unpairDevice: (deviceId: string) => Promise<void>;
  respondToDoctor: (doctorId: string, action: "ACCEPT" | "REJECT") => Promise<void>;
  revokeDoctor: (doctorId: string) => Promise<void>;
}

const ClinicPatientContext = createContext<ClinicPatientContextValue | null>(null);

/**
 * Shared data layer for the /clinic/patient/* pages: one fetch of the patient
 * record, one live socket, and the device command handlers — so switching
 * pages never refetches or drops the live stream.
 */
export function ClinicPatientProvider({ children }: { children: ReactNode }) {
  const { status, token, user } = useAuth();
  const router = useRouter();
  const api = useApi();

  const [summaries, setSummaries] = useState<VitalSummary[]>([]);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [devices, setDevices] = useState<DeviceSummary[]>([]);
  const [sessions, setSessions] = useState<EcgSessionSummary[]>([]);
  const [doctors, setDoctors] = useState<DoctorLink[]>([]);
  const [pendingDoctors, setPendingDoctors] = useState<DoctorLink[]>([]);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [trendType, setTrendType] = useState<MeasurementType>("HEART_RATE");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyDeviceId, setBusyDeviceId] = useState<string | null>(null);
  const [busyDoctorId, setBusyDoctorId] = useState<string | null>(null);
  const [activeTest, setActiveTest] = useState<string | null>(null);

  const [liveVitals, setLiveVitals] = useState<
    Partial<Record<MeasurementType, { value: number; unit: string; measuredAt: string }>>
  >({});
  const [ecgChunk, setEcgChunk] = useState<LiveEcgChunk | null>(null);
  const [activeSession, setActiveSession] = useState<ActiveEcgSession | null>(null);
  const [deviceStatuses, setDeviceStatuses] = useState<
    Record<string, LiveDeviceStatus | undefined>
  >({});
  const [deviceEvents, setDeviceEvents] = useState<LiveDeviceEvent[]>([]);
  const [lastAck, setLastAck] = useState<LiveCommandAck | null>(null);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const loadAll = useCallback(
    async (signal?: AbortSignal) => {
      const [summary, recent, deviceList, sessionList, doctorList, pendingList] =
        await Promise.all([
          api<VitalSummary[]>("/measurements/summary", { signal }),
          api<Measurement[]>(`/measurements${queryString({ limit: 12 })}`, { signal }),
          api<DeviceSummary[]>("/devices", { signal }),
          api<EcgSessionSummary[]>(`/measurements/ecg-sessions${queryString({ limit: 8 })}`, {
            signal,
          }),
          api<DoctorLink[]>(`/doctors/my-doctors${queryString({ state: "ACCEPTED" })}`, { signal }),
          api<DoctorLink[]>("/doctors/my-requests/pending", { signal }),
        ]);

      if (!mounted.current) return;
      setSummaries(summary);
      setMeasurements(recent);
      setDevices(deviceList);
      setSessions(sessionList);
      setDoctors(doctorList);
      setPendingDoctors(pendingList);

      // Resume the strip if a recording was already running before page load.
      const running = sessionList.find((session) => session.inProgress);
      if (running) {
        setActiveSession({
          sessionId: running.id,
          deviceId: running.deviceId,
          sampleRate: running.sampleRate,
        });
      }
    },
    [api],
  );

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/");
    if (status !== "authenticated") return;

    const controller = new AbortController();
    setLoading(true);
    loadAll(controller.signal)
      .then(() => {
        if (mounted.current) setError(null);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (mounted.current) {
          setError(err instanceof Error ? err.message : "Could not load your dashboard");
        }
      })
      .finally(() => {
        if (mounted.current) setLoading(false);
      });

    return () => controller.abort();
  }, [status, router, loadAll]);

  useEffect(() => {
    if (status !== "authenticated") return;
    const controller = new AbortController();

    api<TrendPoint[]>(`/measurements/trends${queryString({ type: trendType, days: 30 })}`, {
      signal: controller.signal,
    })
      .then((points) => {
        if (mounted.current) setTrend(points);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (mounted.current) setTrend([]);
      });

    return () => controller.abort();
  }, [status, api, trendType]);

  const handleMeasurement = useCallback((measurement: LiveMeasurement) => {
    setLiveVitals((previous) => ({
      ...previous,
      [measurement.type]: {
        value: measurement.value,
        unit: measurement.unit,
        measuredAt: measurement.measuredAt,
      },
    }));

    setMeasurements((previous) => {
      if (previous.some((item) => item.id === measurement.id)) return previous;
      return [
        {
          id: measurement.id,
          type: measurement.type,
          value: measurement.value,
          unit: measurement.unit,
          quality: measurement.quality,
          measuredAt: measurement.measuredAt,
        },
        ...previous,
      ].slice(0, MAX_LIVE_HISTORY);
    });
  }, []);

  const handleEcgChunk = useCallback((chunk: LiveEcgChunk) => {
    setEcgChunk(chunk);
  }, []);

  const handleEcgSessionEnd = useCallback(() => {
    setActiveSession(null);
    // Refresh the session list so the finished recording shows its duration.
    void api<EcgSessionSummary[]>(`/measurements/ecg-sessions${queryString({ limit: 8 })}`)
      .then((list) => {
        if (mounted.current) setSessions(list);
      })
      .catch(() => undefined);
  }, [api]);

  const handleDeviceStatus = useCallback((status: LiveDeviceStatus) => {
    setDeviceStatuses((previous) => ({ ...previous, [status.deviceId]: status }));
  }, []);

  const handleCommandAck = useCallback((ack: LiveCommandAck) => {
    setLastAck(ack);
    if (ack.command === "STOP_ECG" && ack.status === "COMPLETED") {
      setActiveSession(null);
    }
  }, []);

  // Newest first, and bounded — a device that keeps complaining should not grow
  // this list without limit over a long session.
  const handleDeviceEvent = useCallback((event: LiveDeviceEvent) => {
    setDeviceEvents((previous) => [event, ...previous].slice(0, MAX_LIVE_HISTORY));
  }, []);

  const live = useLiveFeed(token, {
    onMeasurement: handleMeasurement,
    onEcgChunk: handleEcgChunk,
    onEcgSessionEnd: handleEcgSessionEnd,
    onDeviceStatus: handleDeviceStatus,
    onCommandAck: handleCommandAck,
    onDeviceEvent: handleDeviceEvent,
  });

  const sendCommand = useCallback(
    async (deviceId: string, command: string, durationSeconds?: number) => {
      setBusyDeviceId(deviceId);
      setNotice(null);
      try {
        const result = await api<CommandResult>(`/devices/${deviceId}/commands`, {
          method: "POST",
          body: durationSeconds === undefined ? { command } : { command, durationSeconds },
        });
        setNotice(`Sent ${result.command} to the device.`);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Command failed");
      } finally {
        if (mounted.current) setBusyDeviceId(null);
      }
    },
    [api],
  );

  const pairDevice = useCallback(
    async (pairingCode: string) => {
      await api("/devices/pair", { method: "POST", body: { pairingCode } });
      const list = await api<DeviceSummary[]>("/devices");
      if (!mounted.current) return;
      setDevices(list);
      setNotice("Device paired.");
    },
    [api],
  );

  const unpairDevice = useCallback(
    async (deviceId: string) => {
      setBusyDeviceId(deviceId);
      try {
        await api(`/devices/${deviceId}`, { method: "DELETE" });
        if (!mounted.current) return;
        setDevices((previous) => previous.filter((device) => device.deviceId !== deviceId));
        setNotice("Device unpaired.");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not unpair the device");
      } finally {
        if (mounted.current) setBusyDeviceId(null);
      }
    },
    [api],
  );

  const respondToDoctor = useCallback(
    async (doctorId: string, action: "ACCEPT" | "REJECT") => {
      setBusyDoctorId(doctorId);
      try {
        await api(`/doctors/requests/${doctorId}/respond`, { method: "POST", body: { action } });
        const [accepted, pending] = await Promise.all([
          api<DoctorLink[]>(`/doctors/my-doctors${queryString({ state: "ACCEPTED" })}`),
          api<DoctorLink[]>("/doctors/my-requests/pending"),
        ]);
        if (!mounted.current) return;
        setDoctors(accepted);
        setPendingDoctors(pending);
        setNotice(action === "ACCEPT" ? "Access granted." : "Request declined.");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not update the request");
      } finally {
        if (mounted.current) setBusyDoctorId(null);
      }
    },
    [api],
  );

  const revokeDoctor = useCallback(
    async (doctorId: string) => {
      setBusyDoctorId(doctorId);
      try {
        await api(`/doctors/relationships/${doctorId}`, { method: "DELETE" });
        if (!mounted.current) return;
        setDoctors((previous) => previous.filter((doctor) => doctor.doctorId !== doctorId));
        setNotice("Access revoked.");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not revoke access");
      } finally {
        if (mounted.current) setBusyDoctorId(null);
      }
    },
    [api],
  );

  const onlineCount = useMemo(
    () =>
      devices.filter((device) => {
        const status = deviceStatuses[device.deviceId];
        return status ? status.wifiConnected && status.mqttConnected : device.online;
      }).length,
    [devices, deviceStatuses],
  );

  const primaryDevice = devices[0] ?? null;
  const primaryOnline = primaryDevice
    ? deviceStatuses[primaryDevice.deviceId]
      ? Boolean(
          deviceStatuses[primaryDevice.deviceId]?.wifiConnected &&
            deviceStatuses[primaryDevice.deviceId]?.mqttConnected,
        )
      : primaryDevice.online
    : false;

  const runTest = useCallback(
    (id: string) => {
      // Open the panel only when the command can actually be sent — a
      // "live telemetry" header over an unpaired device is a lie.
      if (!primaryDevice || !primaryOnline) {
        setError("Pair and connect a device before starting a test.");
        return;
      }
      setActiveTest(id);
      if (id === "ecg") void sendCommand(primaryDevice.deviceId, "START_ECG", 60);
      if (id === "spo2") void sendCommand(primaryDevice.deviceId, "START_SPO2");
      if (id === "temp") void sendCommand(primaryDevice.deviceId, "START_TEMPERATURE");
    },
    [primaryDevice, primaryOnline, sendCommand],
  );

  const value = useMemo<ClinicPatientContextValue>(
    () => ({
      user: { email: user?.email ?? "", id: user?.id ?? "" },
      loading,
      error,
      notice,
      summaries,
      measurements,
      devices,
      sessions,
      doctors,
      pendingDoctors,
      trend,
      trendType,
      setTrendType,
      liveVitals,
      ecgChunk,
      activeSession,
      deviceStatuses,
      deviceEvents,
      lastAck,
      live,
      busyDeviceId,
      busyDoctorId,
      activeTest,
      setActiveTest,
      primaryDevice,
      primaryOnline,
      onlineCount,
      runTest,
      sendCommand,
      pairDevice,
      unpairDevice,
      respondToDoctor,
      revokeDoctor,
    }),
    [
      user,
      loading,
      error,
      notice,
      summaries,
      measurements,
      devices,
      sessions,
      doctors,
      pendingDoctors,
      trend,
      trendType,
      liveVitals,
      ecgChunk,
      activeSession,
      deviceStatuses,
      deviceEvents,
      lastAck,
      live,
      busyDeviceId,
      busyDoctorId,
      activeTest,
      setActiveTest,
      primaryDevice,
      primaryOnline,
      onlineCount,
      runTest,
      sendCommand,
      pairDevice,
      unpairDevice,
      respondToDoctor,
      revokeDoctor,
    ],
  );

  return <ClinicPatientContext.Provider value={value}>{children}</ClinicPatientContext.Provider>;
}

export function useClinicPatient(): ClinicPatientContextValue {
  const context = useContext(ClinicPatientContext);
  if (!context) {
    throw new Error("useClinicPatient must be used inside <ClinicPatientProvider>");
  }
  return context;
}
