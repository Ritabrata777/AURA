/** Response shapes returned by the API, mirrored for the client. */

export type MeasurementType = "HEART_RATE" | "SPO2" | "TEMPERATURE" | "PIEZO_HEART_RATE" | "MAX30102_HEART_RATE";
export type MeasurementQuality = "VALID" | "INVALID" | "UNAVAILABLE";
export type UserRole = "PATIENT" | "DOCTOR" | "ADMIN" | "INDIVIDUAL_USER";
export type RelationshipState = "PENDING" | "ACCEPTED" | "REJECTED" | "REVOKED";

export interface SessionUser {
  id: string;
  email: string;
  role: UserRole;
  patientId?: string;
  doctorId?: string;
  individualUserId?: string;
}

export interface AuthResult {
  access_token: string;
  user: SessionUser;
}

export interface Measurement {
  id: string;
  type: MeasurementType;
  value: number;
  unit: string;
  quality: MeasurementQuality;
  measuredAt: string;
  device?: { hardwareId: string } | null;
}

export interface LatestReading {
  value: number;
  unit: string;
  quality: MeasurementQuality;
  measuredAt: string;
}

/** One entry of `GET /measurements/summary`. */
export interface VitalSummary {
  type: MeasurementType;
  latest: LatestReading | null;
  baseline: {
    average: number;
    min: number | null;
    max: number | null;
    sampleCount: number;
    days: number;
  } | null;
  /** Percent difference between the latest reading and the patient's baseline. */
  deviationFromBaseline: number | null;
}

export interface TrendPoint {
  day: string;
  min: number;
  avg: number;
  max: number;
  count: number;
}

export interface DeviceSummary {
  deviceId: string;
  hardwareId: string;
  pairingCode: string;
  lastSeenAt: string | null;
  online: boolean;
  pairedAt: string;
}

export interface EcgSessionSummary {
  id: string;
  deviceId: string;
  hardwareId: string;
  sampleRate: number;
  startedAt: string;
  endedAt: string | null;
  inProgress: boolean;
  chunkCount: number;
  durationSeconds: number | null;
}

/** `GET …/ecg-sessions/:sessionId` — the full recording, flattened. */
export interface EcgSessionDetail extends EcgSessionSummary {
  sampleCount: number;
  samples: number[];
}

export interface CommandResult {
  commandId: string;
  command: string;
  deviceId: string;
  sentAt: string;
  parameters: { durationSeconds?: number } | null;
}

export interface DoctorLink {
  doctorId: string;
  email: string;
  state: RelationshipState;
  createdAt: string;
}

export interface PatientLink {
  patientId: string;
  email: string;
  state: RelationshipState;
  createdAt: string;
}

// ── Prescriptions ────────────────────────────────────────────────────────

export type PrescriptionStatus = "ACTIVE" | "COMPLETED" | "CANCELLED";

export interface PrescriptionMedication {
  id: string;
  drug: string;
  dose: string;
  frequency: string;
  duration: string | null;
  route: string | null;
  instructions: string | null;
}

export interface Prescription {
  id: string;
  patientId: string;
  doctorId: string;
  diagnosis: string;
  notes: string | null;
  status: PrescriptionStatus;
  createdAt: string;
  updatedAt: string;
  medications: PrescriptionMedication[];
  doctor?: { user: { email: string } } | null;
  patient?: { user: { email: string } } | null;
}

/** Request body for `POST /prescriptions`. */
export interface CreatePrescriptionInput {
  patientId: string;
  diagnosis: string;
  notes?: string;
  medications: Array<{
    drug: string;
    dose: string;
    frequency: string;
    duration?: string;
    route?: string;
    instructions?: string;
  }>;
}


// ── Video consultations ──────────────────────────────────────────────────

/** `GET /video/consultations/active` — null when nothing is scheduled. */
export interface ActiveConsultation {
  callId: string;
  appointmentId: string;
  startsAt: string;
  endsAt: string;
  /** Present when the caller is a patient (who the call is with). */
  doctor?: { id: string; email: string };
  /** Present when the caller is a doctor. */
  patient?: { id: string; email: string };
}

/** `GET /video/consultations/:callId/token`. */
export interface ConsultationToken {
  apiKey: string;
  token: string;
  callId: string;
  role: "patient" | "doctor";
  expiresInSeconds: number;
}

// ── Live websocket event payloads ────────────────────────────────────────

export interface LiveMeasurement {
  id: string;
  deviceId: string;
  type: MeasurementType;
  value: number;
  unit: string;
  quality: MeasurementQuality;
  measuredAt: string;
  red?: number;
  ir?: number;
}

export interface LiveEcgChunk {
  deviceId: string;
  sessionId: string;
  sequence: number;
  sampleRate: number;
  samples: number[];
  timestamp: string;
}

export interface LiveEcgSessionEnd {
  deviceId: string;
  sessionId: string;
  totalSamples: number;
  reason: string;
  endedAt: string;
}

export interface LiveDeviceStatus {
  deviceId: string;
  firmwareVersion: string;
  wifiConnected: boolean;
  mqttConnected: boolean;
  timeSynced: boolean;
  freeHeap: number;
  uptimeSeconds: number;
  activeSessionId?: string | null;
  timestamp: string;
}

export interface LiveCommandAck {
  deviceId: string;
  commandId: string;
  command: string;
  status: string;
  errorCode?: string | null;
}

/**
 * An operational notice from the device itself — a sensor that stopped
 * responding, a rejected parameter, a recording that ended early. Distinct
 * from a command ack: nobody asked for it, the device volunteered it.
 */
export interface LiveDeviceEvent {
  deviceId: string;
  severity: "INFO" | "WARN" | "ERROR";
  code: string;
  message: string;
  timestamp: string;
}
