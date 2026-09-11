export const PROTOCOL_VERSION = 1 as const;

export const MQTT_TOPIC_SUFFIXES = {
  status: "status",
  measurements: "measurements",
  ecg: "ecg",
  events: "events",
  commands: "commands",
  acks: "acks",
} as const;

export const MEASUREMENT_TYPES = [
  "HEART_RATE",
  "PIEZO_HEART_RATE",
  "MAX30102_HEART_RATE",
  "SPO2",
  "TEMPERATURE",
] as const;

export type MeasurementType = (typeof MEASUREMENT_TYPES)[number];
export type MeasurementQuality = "VALID" | "INVALID" | "UNAVAILABLE";

/**
 * Commands the firmware understands. STOP_TEMPERATURE was handled by the
 * device but missing here, so the platform could start temperature streaming
 * and never turn it off.
 */
export const DEVICE_COMMANDS = [
  "START_ECG",
  "STOP_ECG",
  "START_SPO2",
  "STOP_SPO2",
  "START_TEMPERATURE",
  "STOP_TEMPERATURE",
  "GET_STATUS",
] as const;

export type DeviceCommand = (typeof DEVICE_COMMANDS)[number];

export type CommandAckStatus = "ACCEPTED" | "COMPLETED" | "REJECTED";

/**
 * A device must be able to acknowledge a command it did not recognise —
 * otherwise the caller waits forever for a request that was already rejected.
 * `UNKNOWN` is only ever valid in an ack, never in an outbound command.
 */
export const COMMAND_ACK_UNKNOWN = "UNKNOWN" as const;
export type CommandAckCommand = DeviceCommand | typeof COMMAND_ACK_UNKNOWN;

export type CommandErrorCode =
  | "INVALID_COMMAND"
  | "BUSY"
  | "SENSOR_UNAVAILABLE"
  | "INVALID_PARAMETERS"
  | "NOT_PROVISIONED";

export const MESSAGE_TYPES = [
  "STATUS",
  "MEASUREMENT",
  "ECG_DATA",
  "ECG_SESSION_END",
  "COMMAND_ACK",
  "EVENT",
] as const;

export type MessageType = (typeof MESSAGE_TYPES)[number];

/** Severity levels for operational device events. */
export const EVENT_SEVERITIES = ["INFO", "WARN", "ERROR"] as const;
export type EventSeverity = (typeof EVENT_SEVERITIES)[number];

/** Upper bound on a single START_ECG recording, enforced on both ends. */
export const ECG_MAX_DURATION_SECONDS = 3600;
export const ECG_MIN_DURATION_SECONDS = 1;

export interface ProtocolEnvelope {
  protocolVersion: typeof PROTOCOL_VERSION;
  messageId: string;
  deviceId: string;
  timestamp: string;
}

export interface StatusMessage extends ProtocolEnvelope {
  type: "STATUS";
  firmwareVersion: string;
  wifiConnected: boolean;
  mqttConnected: boolean;
  timeSynced: boolean;
  freeHeap: number;
  uptimeSeconds: number;
  activeSessionId: string | null;
  /**
   * Sent by the firmware from its first heartbeat. Both were previously
   * undeclared here, which is how the pairing code — the only way a patient
   * can claim a device — stayed invisible to the platform.
   */
  hardwareId?: string;
  pairingCode?: string;
}

export interface MeasurementMessage extends ProtocolEnvelope {
  type: "MEASUREMENT";
  measurementType: MeasurementType;
  value: number;
  unit: string;
  quality: MeasurementQuality;
  sessionId: string;
  red?: number;
  ir?: number;
}

export interface EcgDataMessage extends ProtocolEnvelope {
  type: "ECG_DATA";
  sessionId: string;
  sequence: number;
  sampleRate: number;
  samples: number[];
}

/**
 * Emitted when a recording finishes, so the backend can close the session
 * instead of leaving `endedAt` null forever.
 */
export interface EcgSessionEndMessage extends ProtocolEnvelope {
  type: "ECG_SESSION_END";
  sessionId: string;
  totalSamples: number;
  reason: "STOPPED" | "DURATION_ELAPSED" | "ERROR";
}

/** Parameters accepted per command. START_ECG may carry a recording length. */
export interface DeviceCommandParameters {
  durationSeconds?: number;
}

export interface DeviceCommandMessage extends ProtocolEnvelope {
  commandId: string;
  command: DeviceCommand;
  parameters?: DeviceCommandParameters;
}

export interface CommandAckMessage extends ProtocolEnvelope {
  type: "COMMAND_ACK";
  commandId: string;
  command: CommandAckCommand;
  status: CommandAckStatus;
  errorCode: CommandErrorCode | null;
}

/**
 * Operational notice from a device — a sensor going missing, a rejected
 * parameter, a recording clamped. Recorded in the audit log rather than the
 * measurement tables. The `events` topic was subscribed from day one but had
 * no message type behind it, so anything published there was logged as
 * unsupported and thrown away.
 */
export interface EventMessage extends ProtocolEnvelope {
  type: "EVENT";
  severity: EventSeverity;
  code: string;
  message: string;
}

export type DeviceMessage =
  | StatusMessage
  | MeasurementMessage
  | EcgDataMessage
  | EcgSessionEndMessage
  | CommandAckMessage
  | EventMessage;

export function deviceTopic(deviceId: string, suffix: keyof typeof MQTT_TOPIC_SUFFIXES): string {
  return `devices/${deviceId}/${MQTT_TOPIC_SUFFIXES[suffix]}`;
}

// ── Runtime validation ────────────────────────────────────────────────
// The ingestion path receives bytes from an untrusted network, so it needs
// real guards rather than a cast through `any`. Each guard narrows to the
// concrete message type and rejects structurally invalid payloads.

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

export function isProtocolEnvelope(
  value: unknown,
): value is ProtocolEnvelope & { type: string } {
  if (!isRecord(value)) return false;
  return (
    value.protocolVersion === PROTOCOL_VERSION &&
    typeof value.messageId === "string" &&
    value.messageId.length > 0 &&
    typeof value.deviceId === "string" &&
    value.deviceId.length > 0 &&
    isIsoTimestamp(value.timestamp) &&
    typeof value.type === "string" &&
    (MESSAGE_TYPES as readonly string[]).includes(value.type)
  );
}

export function isMeasurementMessage(value: unknown): value is MeasurementMessage {
  if (!isProtocolEnvelope(value) || value.type !== "MEASUREMENT") return false;
  const m = value as unknown as Record<string, unknown>;
  return (
    (MEASUREMENT_TYPES as readonly string[]).includes(m.measurementType as string) &&
    typeof m.value === "number" &&
    Number.isFinite(m.value) &&
    typeof m.unit === "string" &&
    (["VALID", "INVALID", "UNAVAILABLE"] as const).includes(m.quality as MeasurementQuality) &&
    typeof m.sessionId === "string" &&
    (m.red === undefined || typeof m.red === "number") &&
    (m.ir === undefined || typeof m.ir === "number")
  );
}

export function isEcgDataMessage(value: unknown): value is EcgDataMessage {
  if (!isProtocolEnvelope(value) || value.type !== "ECG_DATA") return false;
  const m = value as unknown as Record<string, unknown>;
  return (
    typeof m.sessionId === "string" &&
    m.sessionId.length > 0 &&
    typeof m.sequence === "number" &&
    Number.isInteger(m.sequence) &&
    m.sequence >= 0 &&
    typeof m.sampleRate === "number" &&
    m.sampleRate > 0 &&
    Array.isArray(m.samples) &&
    m.samples.every((s) => typeof s === "number" && Number.isFinite(s))
  );
}

export function isEcgSessionEndMessage(value: unknown): value is EcgSessionEndMessage {
  if (!isProtocolEnvelope(value) || value.type !== "ECG_SESSION_END") return false;
  const m = value as unknown as Record<string, unknown>;
  return (
    typeof m.sessionId === "string" &&
    m.sessionId.length > 0 &&
    typeof m.totalSamples === "number" &&
    (["STOPPED", "DURATION_ELAPSED", "ERROR"] as const).includes(
      m.reason as EcgSessionEndMessage["reason"],
    )
  );
}

export function isCommandAckMessage(value: unknown): value is CommandAckMessage {
  if (!isProtocolEnvelope(value) || value.type !== "COMMAND_ACK") return false;
  const m = value as unknown as Record<string, unknown>;
  return (
    typeof m.commandId === "string" &&
    m.commandId.length > 0 &&
    // "UNKNOWN" must be accepted: it is how a device reports that it could not
    // recognise a command at all. Rejecting it here meant those acks were
    // dropped and the request appeared to hang.
    ((DEVICE_COMMANDS as readonly string[]).includes(m.command as string) ||
      m.command === COMMAND_ACK_UNKNOWN) &&
    (["ACCEPTED", "COMPLETED", "REJECTED"] as const).includes(m.status as CommandAckStatus)
  );
}

export function isEventMessage(value: unknown): value is EventMessage {
  if (!isProtocolEnvelope(value) || value.type !== "EVENT") return false;
  const m = value as unknown as Record<string, unknown>;
  return (
    (EVENT_SEVERITIES as readonly string[]).includes(m.severity as string) &&
    typeof m.code === "string" &&
    m.code.length > 0 &&
    typeof m.message === "string"
  );
}

export function isStatusMessage(value: unknown): value is StatusMessage {
  return isProtocolEnvelope(value) && value.type === "STATUS";
}

export function isDeviceCommand(value: unknown): value is DeviceCommand {
  return typeof value === "string" && (DEVICE_COMMANDS as readonly string[]).includes(value);
}
