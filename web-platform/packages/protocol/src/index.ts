export const PROTOCOL_VERSION = 1 as const;

export const MQTT_TOPIC_SUFFIXES = {
  status: "status",
  measurements: "measurements",
  ecg: "ecg",
  events: "events",
  commands: "commands",
  acks: "acks",
} as const;

export type MeasurementType = "HEART_RATE" | "SPO2" | "TEMPERATURE";
export type MeasurementQuality = "VALID" | "INVALID" | "UNAVAILABLE";
export type DeviceCommand =
  | "START_ECG"
  | "STOP_ECG"
  | "START_SPO2"
  | "STOP_SPO2"
  | "START_TEMPERATURE"
  | "GET_STATUS";
export type CommandAckStatus = "ACCEPTED" | "COMPLETED" | "REJECTED";
export type CommandErrorCode =
  | "INVALID_COMMAND"
  | "BUSY"
  | "SENSOR_UNAVAILABLE"
  | "INVALID_PARAMETERS"
  | "NOT_PROVISIONED";

export interface ProtocolEnvelope {
  protocolVersion: typeof PROTOCOL_VERSION;
  messageId: string;
  deviceId: string;
  timestamp: string;
}

export interface MeasurementMessage extends ProtocolEnvelope {
  type: "MEASUREMENT";
  measurementType: MeasurementType;
  value: number;
  unit: string;
  quality: MeasurementQuality;
  sessionId: string;
}

export interface EcgDataMessage extends ProtocolEnvelope {
  type: "ECG_DATA";
  sessionId: string;
  sequence: number;
  sampleRate: number;
  samples: number[];
}

export interface DeviceCommandMessage extends ProtocolEnvelope {
  commandId: string;
  command: DeviceCommand;
  parameters?: Record<string, unknown>;
}

export interface CommandAckMessage extends ProtocolEnvelope {
  type: "COMMAND_ACK";
  commandId: string;
  command: DeviceCommand;
  status: CommandAckStatus;
  errorCode: CommandErrorCode | null;
}

export function deviceTopic(deviceId: string, suffix: keyof typeof MQTT_TOPIC_SUFFIXES): string {
  return `devices/${deviceId}/${MQTT_TOPIC_SUFFIXES[suffix]}`;
}
