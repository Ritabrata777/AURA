"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { useAuth, useApi } from "@/lib/auth";
import { queryString } from "@/lib/api";
import { useLiveFeed, type LiveFeed } from "@/lib/live";
import { describeDeviation } from "@/lib/format";
import type {
  EcgSessionSummary,
  LiveEcgChunk,
  LiveMeasurement,
  Measurement,
  MeasurementType,
  PatientLink,
  TrendPoint,
  VitalSummary,
} from "@/lib/types";

interface ClinicDoctorContextValue {
  user: { email: string; id: string };
  patients: PatientLink[];
  accepted: PatientLink[];
  awaiting: PatientLink[];
  selected: PatientLink | null;
  selectedPatientId: string | null;
  selectPatient: (patientId: string) => void;
  requestEmail: string;
  setRequestEmail: (email: string) => void;
  requestAccess: (event: React.FormEvent) => Promise<void>;
  summaries: VitalSummary[];
  measurements: Measurement[];
  sessions: EcgSessionSummary[];
  trend: TrendPoint[];
  trendType: MeasurementType;
  setTrendType: (type: MeasurementType) => void;
  liveVitals: Partial<
    Record<MeasurementType, { value: number; unit: string; measuredAt: string }>
  >;
  ecgChunk: LiveEcgChunk | null;
  liveSessionId: string | null;
  live: LiveFeed;
  loadingPatient: boolean;
  error: string | null;
  notice: string | null;
  urgent: boolean;
}

const ClinicDoctorContext = createContext<ClinicDoctorContextValue | null>(null);

/**
 * Shared data layer for the /clinic/doctor/* pages: the care list, the
 * selected patient's record, and the live socket scoped to that patient.
 * The selection survives a full page reload via sessionStorage.
 */
export function ClinicDoctorProvider({ children }: { children: ReactNode }) {
  const { status, token, user } = useAuth();
  const router = useRouter();
  const api = useApi();

  const [patients, setPatients] = useState<PatientLink[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [requestEmail, setRequestEmail] = useState("");

  const [summaries, setSummaries] = useState<VitalSummary[]>([]);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [sessions, setSessions] = useState<EcgSessionSummary[]>([]);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [trendType, setTrendType] = useState<MeasurementType>("HEART_RATE");

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loadingPatient, setLoadingPatient] = useState(false);

  const [liveVitals, setLiveVitals] = useState<
    Partial<Record<MeasurementType, { value: number; unit: string; measuredAt: string }>>
  >({});
  const [ecgChunk, setEcgChunk] = useState<LiveEcgChunk | null>(null);
  const [liveSessionId, setLiveSessionId] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/");
  }, [status, router]);

  // Restore the selection after a reload so a doctor mid-review does not lose
  // their patient to a refresh.
  useEffect(() => {
    if (status !== "authenticated") return;
    const saved = sessionStorage.getItem("clinic.doctor.selectedPatientId");
    if (saved) setSelectedPatientId(saved);
  }, [status]);

  const loadPatients = useCallback(async () => {
    const list = await api<PatientLink[]>("/doctors/patients");
    setPatients(list);
    return list;
  }, [api]);

  useEffect(() => {
    if (status !== "authenticated") return;
    loadPatients().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "Could not load your patients");
    });
  }, [status, loadPatients]);

  const selectPatient = useCallback((patientId: string) => {
    setSelectedPatientId(patientId);
    sessionStorage.setItem("clinic.doctor.selectedPatientId", patientId);
  }, []);

  // Switching patients must reset every panel, otherwise one patient's vitals
  // linger on screen while the next patient's data loads.
  useEffect(() => {
    if (status !== "authenticated" || !selectedPatientId) return;

    const controller = new AbortController();
    setLoadingPatient(true);
    setError(null);
    setLiveVitals({});
    setEcgChunk(null);
    setLiveSessionId(null);

    Promise.all([
      api<VitalSummary[]>(`/measurements/patients/${selectedPatientId}/summary`, {
        signal: controller.signal,
      }),
      api<Measurement[]>(
        `/measurements/patients/${selectedPatientId}/measurements${queryString({ limit: 12 })}`,
        { signal: controller.signal },
      ),
      api<EcgSessionSummary[]>(
        `/measurements/patients/${selectedPatientId}/ecg-sessions${queryString({ limit: 8 })}`,
        { signal: controller.signal },
      ),
    ])
      .then(([summary, recent, sessionList]) => {
        setSummaries(summary);
        setMeasurements(recent);
        setSessions(sessionList);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setSummaries([]);
        setMeasurements([]);
        setSessions([]);
        setError(err instanceof Error ? err.message : "Could not load this patient");
      })
      .finally(() => setLoadingPatient(false));

    return () => controller.abort();
  }, [status, api, selectedPatientId]);

  useEffect(() => {
    if (status !== "authenticated" || !selectedPatientId) return;
    const controller = new AbortController();

    api<TrendPoint[]>(
      `/measurements/patients/${selectedPatientId}/trends${queryString({ type: trendType, days: 30 })}`,
      { signal: controller.signal },
    )
      .then(setTrend)
      .catch(() => setTrend([]));

    return () => controller.abort();
  }, [status, api, selectedPatientId, trendType]);

  const handleMeasurement = useCallback((measurement: LiveMeasurement) => {
    setLiveVitals((previous) => ({
      ...previous,
      [measurement.type]: {
        value: measurement.value,
        unit: measurement.unit,
        measuredAt: measurement.measuredAt,
      },
    }));
  }, []);

  const handleEcgChunk = useCallback((chunk: LiveEcgChunk) => {
    setEcgChunk(chunk);
    setLiveSessionId(chunk.sessionId);
  }, []);

  const live = useLiveFeed(
    token,
    {
      onMeasurement: handleMeasurement,
      onEcgChunk: handleEcgChunk,
      onEcgSessionEnd: () => setLiveSessionId(null),
    },
    { watchPatientId: selectedPatientId ?? undefined },
  );

  const requestAccess = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      const email = requestEmail.trim();
      if (!email) return;

      try {
        // By email, not by UUID: nothing in the product ever shows a patient
        // their own id, so a clinician could never fill in the id form.
        await api("/doctors/patients/request-by-email", {
          method: "POST",
          body: { email },
        });
        setNotice("Access requested. The patient must approve it before data is shared.");
        setRequestEmail("");
        await loadPatients();
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not request access");
      }
    },
    [api, requestEmail, loadPatients],
  );

  const value = useMemo<ClinicDoctorContextValue>(() => {
    const accepted = patients.filter((patient) => patient.state === "ACCEPTED");
    const awaiting = patients.filter((patient) => patient.state === "PENDING");
    const selected = patients.find((patient) => patient.patientId === selectedPatientId) ?? null;

    const urgent = summaries.some((summary) => {
      const liveReading = liveVitals[summary.type];
      const latest = liveReading ?? summary.latest;
      const average = summary.baseline?.average ?? null;
      const deviation =
        latest && average !== null && average !== 0
          ? Math.round(((latest.value - average) / average) * 1000) / 10
          : summary.deviationFromBaseline;
      return describeDeviation(deviation).tone === "up";
    });

    return {
      user: { email: user?.email ?? "", id: user?.id ?? "" },
      patients,
      accepted,
      awaiting,
      selected,
      selectedPatientId,
      selectPatient,
      requestEmail,
      setRequestEmail,
      requestAccess,
      summaries,
      measurements,
      sessions,
      trend,
      trendType,
      setTrendType,
      liveVitals,
      ecgChunk,
      liveSessionId,
      live,
      loadingPatient,
      error,
      notice,
      urgent,
    };
  }, [
    user,
    patients,
    selectedPatientId,
    selectPatient,
    requestEmail,
    requestAccess,
    summaries,
    measurements,
    sessions,
    trend,
    trendType,
    liveVitals,
    ecgChunk,
    liveSessionId,
    live,
    loadingPatient,
    error,
    notice,
  ]);

  return <ClinicDoctorContext.Provider value={value}>{children}</ClinicDoctorContext.Provider>;
}

export function useClinicDoctor(): ClinicDoctorContextValue {
  const context = useContext(ClinicDoctorContext);
  if (!context) {
    throw new Error("useClinicDoctor must be used inside <ClinicDoctorProvider>");
  }
  return context;
}
