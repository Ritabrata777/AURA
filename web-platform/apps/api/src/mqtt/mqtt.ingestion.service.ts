import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { MqttClient } from "mqtt";
import mqtt from "mqtt";
import { PROTOCOL_VERSION, deviceTopic, MeasurementMessage, EcgDataMessage, DeviceCommandMessage, CommandAckMessage } from "@health-platform/protocol";
import { PrismaService } from "../prisma/prisma.service";
import { LiveGateway } from "../websocket/websocket.gateway";

@Injectable()
export class MqttIngestionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MqttIngestionService.name);
  private client?: MqttClient;

  constructor(
    private readonly prisma: PrismaService,
    private readonly websocket: LiveGateway,
  ) {}

  onModuleInit() {
    const url = process.env.MQTT_URL || "mqtt://localhost:1883";
    
    this.client = mqtt.connect(url, {
      clientId: `health-platform-${process.pid}`,
      clean: true,
      reconnectPeriod: 0,
      connectTimeout: 5000,
    });

    this.client.on("connect", () => {
      this.logger.log(`Connected to MQTT broker at ${url}`);
      this.client?.subscribe("devices/+/+", (error) => {
        if (error) {
          this.logger.error(`MQTT subscription failed: ${error.message}`);
        } else {
          this.logger.log("Subscribed to devices/+/+");
        }
      });
    });

    this.client.on("message", (topic, payload) => this.handleMessage(topic, payload.toString()));
    this.client.on("error", () => {
      this.logger.warn(`MQTT broker unavailable at ${url} — skipping. Install Docker and run "docker compose up -d" to enable.`);
      this.client?.removeAllListeners();
      this.client?.end(true);
      this.client = undefined;
    });
    this.client.on("close", () => {
      if (this.client) {
        this.logger.warn("MQTT connection closed");
      }
    });
  }

  onModuleDestroy() {
    this.client?.end();
  }

  private async handleMessage(topic: string, rawPayload: string) {
    let payload: unknown;
    try {
      payload = JSON.parse(rawPayload);
    } catch {
      this.logger.warn(`Rejected non-JSON MQTT payload on ${topic}`);
      return;
    }

    if (!this.isProtocolEnvelope(payload)) {
      this.logger.warn(`Rejected invalid protocol payload on ${topic}`);
      return;
    }

    const deviceId = payload.deviceId;
    const message = payload as any;

    this.logger.debug(`Received ${message.type} from device ${deviceId}`);

    try {
      switch (message.type) {
        case "STATUS":
          await this.handleStatus(deviceId, message);
          break;
        case "MEASUREMENT":
          await this.handleMeasurement(deviceId, message as MeasurementMessage);
          break;
        case "ECG_DATA":
          await this.handleEcgData(deviceId, message as EcgDataMessage);
          break;
        case "COMMAND_ACK":
          await this.handleCommandAck(deviceId, message as CommandAckMessage);
          break;
        default:
          this.logger.warn(`Unknown message type: ${message.type}`);
      }
    } catch (error: any) {
      this.logger.error(`Error processing message: ${error?.message || "Unknown error"}`);
    }
  }

  private async handleStatus(deviceId: string, message: any) {
    await this.prisma.device.update({
      where: { id: deviceId },
      data: {
        lastSeenAt: new Date(message.timestamp),
      },
    });

    this.websocket.emitToPatientRoom(deviceId, "device:status", message);
  }

  private async handleMeasurement(deviceId: string, message: MeasurementMessage) {
    const device = await this.prisma.device.findUnique({
      include: { patientLinks: { include: { patient: true } } },
      where: { id: deviceId },
    });

    if (!device || device.patientLinks.length === 0) {
      this.logger.warn(`Measurement from unpaired device ${deviceId}`);
      return;
    }

    const patientId = device.patientLinks[0].patientId;

    const measurement = await this.prisma.measurement.create({
      data: {
        patientId,
        deviceId,
        type: message.measurementType,
        value: message.value,
        unit: message.unit,
        quality: message.quality,
        sessionId: message.sessionId,
        measuredAt: new Date(message.timestamp),
      },
    });

    this.websocket.emitToPatientRoom(patientId, "measurement:new", {
      type: measurement.type,
      value: measurement.value,
      unit: measurement.unit,
      quality: measurement.quality,
      measuredAt: measurement.measuredAt,
    });
  }

  private async handleEcgData(deviceId: string, message: EcgDataMessage) {
    const device = await this.prisma.device.findUnique({
      include: { patientLinks: { include: { patient: true } } },
      where: { id: deviceId },
    });

    if (!device || device.patientLinks.length === 0) {
      this.logger.warn(`ECG data from unpaired device ${deviceId}`);
      return;
    }

    const patientId = device.patientLinks[0].patientId;

    let session = await this.prisma.ecgSession.findUnique({
      where: { id: message.sessionId },
    });

    if (!session) {
      session = await this.prisma.ecgSession.create({
        data: {
          patientId,
          deviceId,
          sampleRate: message.sampleRate,
          startedAt: new Date(message.timestamp),
        },
      });
    }

    await this.prisma.ecgChunk.upsert({
      create: {
        sessionId: message.sessionId,
        sequence: message.sequence,
        timestamp: new Date(message.timestamp),
        samples: message.samples,
      },
      update: {
        timestamp: new Date(message.timestamp),
        samples: message.samples,
      },
      where: {
        sessionId_sequence: {
          sessionId: message.sessionId,
          sequence: message.sequence,
        },
      },
    });

    this.websocket.emitToPatientRoom(patientId, "ecg:chunk", {
      sessionId: message.sessionId,
      sequence: message.sequence,
      sampleRate: message.sampleRate,
      samples: message.samples,
      timestamp: message.timestamp,
    });
  }

  private async handleCommandAck(deviceId: string, message: CommandAckMessage) {
    this.logger.debug(`Command ACK from ${deviceId}: ${message.command} - ${message.status}`);
    
    const device = await this.prisma.device.findUnique({
      include: { patientLinks: true },
      where: { id: deviceId },
    });

    if (device && device.patientLinks.length > 0) {
      const patientId = device.patientLinks[0].patientId;
      this.websocket.emitToPatientRoom(patientId, "command:ack", {
        commandId: message.commandId,
        command: message.command,
        status: message.status,
        errorCode: message.errorCode,
      });
    }
  }

  private isProtocolEnvelope(value: unknown): value is {
    protocolVersion: number;
    messageId: string;
    deviceId: string;
    timestamp: string;
    type: string;
  } {
    if (typeof value !== "object" || value === null) return false;
    const envelope = value as Record<string, unknown>;
    return envelope.protocolVersion === PROTOCOL_VERSION
      && typeof envelope.messageId === "string"
      && typeof envelope.deviceId === "string"
      && typeof envelope.timestamp === "string"
      && typeof envelope.type === "string";
  }

  async publishCommand(deviceId: string, command: DeviceCommandMessage) {
    if (!this.client) {
      throw new Error("MQTT client not connected");
    }

    const topic = deviceTopic(deviceId, "commands");
    const payload = JSON.stringify(command);

    return new Promise<void>((resolve, reject) => {
      this.client?.publish(topic, payload, { qos: 1 }, (error) => {
        if (error) {
          this.logger.error(`Failed to publish command: ${error.message}`);
          reject(error);
        } else {
          this.logger.debug(`Published command ${command.command} to ${deviceId}`);
          resolve();
        }
      });
    });
  }
}
