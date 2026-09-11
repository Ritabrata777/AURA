import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { MqttClient } from "mqtt";
import mqtt from "mqtt";
import {
  deviceTopic,
  isCommandAckMessage,
  isEcgDataMessage,
  isEcgSessionEndMessage,
  isEventMessage,
  isMeasurementMessage,
  isProtocolEnvelope,
  isStatusMessage,
  CommandAckMessage,
  DeviceCommandMessage,
  EcgDataMessage,
  EcgSessionEndMessage,
  EventMessage,
  MeasurementMessage,
  StatusMessage,
} from "@health-platform/protocol";
import { PrismaService } from "../prisma/prisma.service";
import { LiveGateway } from "../websocket/websocket.gateway";

/**
 * Everything needed to route one device's traffic, resolved once per message.
 *
 * The two ids are deliberately separate. A device knows itself by its
 * `hardwareId` (its MAC, baked in at boot) and publishes under that name; the
 * database keys every row and API response on `Device.id`, a UUID minted
 * during provisioning. Conflating the two is what made every device look
 * permanently offline.
 */
interface DeviceRouting {
  deviceId: string;
  hardwareId: string;
  patientId: string | null;
  individualUserId: string | null;
  cachedAt: number;
}

@Injectable()
export class MqttIngestionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MqttIngestionService.name);
  private client?: MqttClient;

  /**
   * Every ECG chunk previously triggered a `device.findUnique` with two nested
   * includes. At 250 Hz in 50-sample chunks that is 5 joins per second per
   * device, purely to re-learn a mapping that almost never changes.
   *
   * Keyed by the *topic* identity, which is what arrives on the wire.
   */
  private readonly routingCache = new Map<string, DeviceRouting>();
  private static readonly ROUTING_TTL_MS = 60_000;

  /** Sessions already created this process, to skip a lookup per chunk. */
  private readonly knownSessions = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly websocket: LiveGateway,
  ) {}

  onModuleInit() {
    const url = process.env.MQTT_URL || "mqtt://localhost:1883";

    this.client = mqtt.connect(url, {
      clientId: `health-platform-${process.pid}`,
      clean: true,
      // Previously 0, which disabled reconnection entirely: a single broker
      // restart silently ended device ingestion until the API was restarted.
      reconnectPeriod: 5000,
      connectTimeout: 5000,
      resubscribe: true,
    });

    this.client.on("connect", () => {
      this.logger.log(`Connected to MQTT broker at ${url}`);
      // Only subscribe to topics devices publish. `devices/+/+` also matched
      // `devices/+/commands`, so the API consumed its own outbound commands
      // and logged them as unknown message types.
      for (const suffix of ["status", "measurements", "ecg", "events", "acks"]) {
        this.client?.subscribe(`devices/+/${suffix}`, { qos: 1 }, (error) => {
          if (error) {
            this.logger.error(`MQTT subscription to ${suffix} failed: ${error.message}`);
          }
        });
      }
      this.logger.log("Subscribed to device publish topics");
    });

    this.client.on("reconnect", () => {
      this.logger.warn(`Reconnecting to MQTT broker at ${url}`);
    });

    this.client.on("message", (topic, payload) => {
      void this.handleMessage(topic, payload.toString());
    });

    this.client.on("error", (err) => {
      this.logger.warn(
        `MQTT broker unavailable at ${url} — device ingestion degraded (${err.message}). Start Docker and run "docker compose up -d" to enable.`,
      );
    });

    this.client.on("close", () => {
      this.logger.warn("MQTT connection closed");
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

    if (!isProtocolEnvelope(payload)) {
      this.logger.warn(`Rejected invalid protocol payload on ${topic}`);
      return;
    }

    // The device id in the payload must match the topic it arrived on,
    // otherwise one device could write into another device's record.
    const topicDeviceId = topic.split("/")[1];
    if (topicDeviceId !== payload.deviceId) {
      this.logger.warn(
        `Rejected message: topic device ${topicDeviceId} does not match payload device ${payload.deviceId}`,
      );
      return;
    }

    // Development firmware uses the stable hardware ID on MQTT while the API
    // assigns a UUID during provisioning. Both forms are normalized to the
    // UUID used by relational records and websocket events, and the result is
    // cached: this used to be an uncached query on *every* message, which at
    // 250 Hz in 50-sample chunks is five device lookups per second per device.
    const routing = await this.resolveRouting(payload.deviceId);

    if (!routing) {
      this.logger.warn(
        `Ignoring ${payload.type} from unprovisioned device ${payload.deviceId} — no Device row has this id or hardwareId`,
      );
      return;
    }

    const deviceId = routing.deviceId;

    try {
      if (isStatusMessage(payload)) {
        await this.handleStatus(routing, payload);
      } else if (isMeasurementMessage(payload)) {
        await this.handleMeasurement(routing, payload);
      } else if (isEcgDataMessage(payload)) {
        await this.handleEcgData(routing, payload);
      } else if (isEcgSessionEndMessage(payload)) {
        await this.handleEcgSessionEnd(routing, payload);
      } else if (isCommandAckMessage(payload)) {
        await this.handleCommandAck(routing, payload);
      } else if (isEventMessage(payload)) {
        await this.handleEvent(routing, payload);
      } else {
        this.logger.warn(`Malformed or unsupported ${payload.type} message from ${deviceId}`);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error processing ${payload.type} from ${deviceId}: ${message}`);
    }
  }

  /**
   * Resolves the identity a device publishes under into its database row and
   * the patient who owns it. Returns null only for an unprovisioned device;
   * a provisioned-but-unclaimed device resolves with `patientId: null`.
   */
  private async resolveRouting(topicDeviceId: string): Promise<DeviceRouting | null> {
    const cached = this.routingCache.get(topicDeviceId);
    if (cached && Date.now() - cached.cachedAt < MqttIngestionService.ROUTING_TTL_MS) {
      return cached;
    }

    const device = await this.prisma.device.findFirst({
      where: { OR: [{ id: topicDeviceId }, { hardwareId: topicDeviceId }] },
      select: {
        id: true,
        hardwareId: true,
        patientLinks: {
          select: { patientId: true },
          orderBy: { pairedAt: "asc" },
          take: 1,
        },
        individualUserLinks: {
          select: { individualUserId: true },
          orderBy: { pairedAt: "asc" },
          take: 1,
        },
      },
    });

    if (!device) {
      this.routingCache.delete(topicDeviceId);
      return null;
    }

    const routing: DeviceRouting = {
      deviceId: device.id,
      hardwareId: device.hardwareId,
      patientId: device.patientLinks[0]?.patientId ?? null,
      individualUserId: device.individualUserLinks[0]?.individualUserId ?? null,
      cachedAt: Date.now(),
    };

    this.routingCache.set(topicDeviceId, routing);
    return routing;
  }

  private async handleStatus({ deviceId, patientId, individualUserId }: DeviceRouting, message: StatusMessage) {
    const updated = await this.prisma.device.updateMany({
      where: { id: deviceId },
      data: { lastSeenAt: new Date(message.timestamp) },
    });

    if (updated.count === 0) {
      this.logger.warn(`Status from unprovisioned device ${deviceId}`);
      return;
    }

    const ownerId = patientId ?? individualUserId;
    if (!ownerId) return;

    this.websocket.emitToPatientRoom(ownerId, "device:status", {
      deviceId,
      firmwareVersion: message.firmwareVersion,
      wifiConnected: message.wifiConnected,
      mqttConnected: message.mqttConnected,
      timeSynced: message.timeSynced,
      freeHeap: message.freeHeap,
      uptimeSeconds: message.uptimeSeconds,
      activeSessionId: message.activeSessionId,
      timestamp: message.timestamp,
    });
  }

  private async handleMeasurement(
    { deviceId, patientId, individualUserId }: DeviceRouting,
    message: MeasurementMessage,
  ) {
    if (patientId) {
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
        id: measurement.id,
        deviceId,
        type: measurement.type,
        value: measurement.value,
        unit: measurement.unit,
        quality: measurement.quality,
        measuredAt: measurement.measuredAt,
        red: message.red,
        ir: message.ir,
      });
    } else if (individualUserId) {
      const measurement = await this.prisma.individualMeasurement.create({
        data: {
          individualUserId,
          deviceId,
          type: message.measurementType,
          value: message.value,
          unit: message.unit,
          quality: message.quality,
          sessionId: message.sessionId,
          measuredAt: new Date(message.timestamp),
        },
      });

      this.websocket.emitToPatientRoom(individualUserId, "measurement:new", {
        id: measurement.id,
        deviceId,
        type: measurement.type,
        value: measurement.value,
        unit: measurement.unit,
        quality: measurement.quality,
        measuredAt: measurement.measuredAt,
      });
    } else {
      this.logger.warn(`Measurement from unpaired device ${deviceId}`);
    }
  }

  private async handleEcgData({ deviceId, patientId, individualUserId }: DeviceRouting, message: EcgDataMessage) {
    const ownerId = patientId ?? individualUserId;
    if (!ownerId) {
      this.logger.warn(`ECG data from unpaired device ${deviceId}`);
      return;
    }

    await this.ensureEcgSession(deviceId, patientId, individualUserId, message);

    if (patientId) {
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
    } else if (individualUserId) {
      await this.prisma.individualEcgChunk.upsert({
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
    }

    this.websocket.emitToPatientRoom(ownerId, "ecg:chunk", {
      deviceId,
      sessionId: message.sessionId,
      sequence: message.sequence,
      sampleRate: message.sampleRate,
      samples: message.samples,
      timestamp: message.timestamp,
    });
  }

  private async ensureEcgSession(
    deviceId: string,
    patientId: string | null,
    individualUserId: string | null,
    message: EcgDataMessage,
  ): Promise<void> {
    if (this.knownSessions.has(message.sessionId)) {
      return;
    }

    if (patientId) {
      await this.prisma.ecgSession.upsert({
        where: { id: message.sessionId },
        create: {
          id: message.sessionId,
          patientId,
          deviceId,
          sampleRate: message.sampleRate,
          startedAt: new Date(message.timestamp),
        },
        update: {},
      });
    } else if (individualUserId) {
      await this.prisma.individualEcgSession.upsert({
        where: { id: message.sessionId },
        create: {
          id: message.sessionId,
          individualUserId,
          deviceId,
          sampleRate: message.sampleRate,
          startedAt: new Date(message.timestamp),
        },
        update: {},
      });
    }

    this.knownSessions.add(message.sessionId);

    if (this.knownSessions.size > MqttIngestionService.MAX_TRACKED_SESSIONS) {
      const oldest = this.knownSessions.values().next().value;
      if (oldest !== undefined) {
        this.knownSessions.delete(oldest);
      }
    }
  }

  private async handleEcgSessionEnd(
    { deviceId, patientId, individualUserId }: DeviceRouting,
    message: EcgSessionEndMessage,
  ) {
    const ownerId = patientId ?? individualUserId;
    if (!ownerId) {
      return;
    }

    if (patientId) {
      const updated = await this.prisma.ecgSession.updateMany({
        where: { id: message.sessionId, deviceId, endedAt: null },
        data: { endedAt: new Date(message.timestamp) },
      });

      if (updated.count === 0) {
        this.logger.debug(`ECG session ${message.sessionId} already closed or unknown`);
      }
    } else if (individualUserId) {
      const updated = await this.prisma.individualEcgSession.updateMany({
        where: { id: message.sessionId, deviceId, endedAt: null },
        data: { endedAt: new Date(message.timestamp) },
      });

      if (updated.count === 0) {
        this.logger.debug(`Individual ECG session ${message.sessionId} already closed or unknown`);
      }
    }

    this.knownSessions.delete(message.sessionId);

    this.websocket.emitToPatientRoom(ownerId, "ecg:session-end", {
      deviceId,
      sessionId: message.sessionId,
      totalSamples: message.totalSamples,
      reason: message.reason,
      endedAt: message.timestamp,
    });
  }

  private async handleCommandAck(
    { deviceId, patientId, individualUserId }: DeviceRouting,
    message: CommandAckMessage,
  ) {
    this.logger.debug(`Command ACK from ${deviceId}: ${message.command} - ${message.status}`);

    if (message.command === "STOP_ECG" && message.status === "COMPLETED") {
      if (patientId) {
        await this.prisma.ecgSession.updateMany({
          where: { deviceId, endedAt: null },
          data: { endedAt: new Date(message.timestamp) },
        });
      } else if (individualUserId) {
        await this.prisma.individualEcgSession.updateMany({
          where: { deviceId, endedAt: null },
          data: { endedAt: new Date(message.timestamp) },
        });
      }
    }

    await this.prisma.auditLog.create({
      data: {
        action: "DEVICE_COMMAND_ACK",
        resource: `device:${deviceId}`,
        metadata: {
          commandId: message.commandId,
          command: message.command,
          status: message.status,
          errorCode: message.errorCode,
        },
      },
    });

    const ownerId = patientId ?? individualUserId;
    if (!ownerId) {
      return;
    }

    this.websocket.emitToPatientRoom(ownerId, "command:ack", {
      deviceId,
      commandId: message.commandId,
      command: message.command,
      status: message.status,
      errorCode: message.errorCode,
    });
  }

  private async handleEvent({ deviceId, patientId, individualUserId }: DeviceRouting, message: EventMessage) {
    const logLine = `Device event from ${deviceId}: [${message.severity}] ${message.code} — ${message.message}`;
    if (message.severity === "ERROR") {
      this.logger.error(logLine);
    } else if (message.severity === "WARN") {
      this.logger.warn(logLine);
    } else {
      this.logger.log(logLine);
    }

    await this.prisma.auditLog.create({
      data: {
        action: "DEVICE_EVENT",
        resource: `device:${deviceId}`,
        metadata: {
          severity: message.severity,
          code: message.code,
          message: message.message,
          occurredAt: message.timestamp,
        },
      },
    });

    const ownerId = patientId ?? individualUserId;
    if (!ownerId) {
      return;
    }

    this.websocket.emitToPatientRoom(ownerId, "device:event", {
      deviceId,
      severity: message.severity,
      code: message.code,
      message: message.message,
      timestamp: message.timestamp,
    });
  }

  /**
   * Drops a device's cached routing so the next message re-reads the database.
   *
   * Callers only know the internal `Device.id`, but the cache is keyed by the
   * identity the device publishes under — usually its `hardwareId`. Deleting
   * just the id-keyed entry left the hardware-keyed one live, so for up to a
   * minute after pairing the ingestion service still believed the device was
   * unclaimed and dropped its measurements on the floor.
   */
  invalidateDeviceRouting(deviceId: string) {
    this.routingCache.delete(deviceId);

    for (const [key, routing] of this.routingCache) {
      if (routing.deviceId === deviceId) {
        this.routingCache.delete(key);
      }
    }
  }

  /**
   * Sends a command to the topic the device is actually listening on.
   *
   * The firmware subscribes to `devices/<hardwareId>/commands`, because at boot
   * all it knows about itself is its MAC. The API had been publishing to
   * `devices/<uuid>/commands`, a topic with no subscriber — so every command
   * was accepted, audited, reported as sent, and silently discarded by the
   * broker. The payload's `deviceId` is rewritten to match the topic segment,
   * since both ends cross-check that the two agree.
   */
  async publishCommand(deviceId: string, command: DeviceCommandMessage) {
    if (!this.client?.connected) {
      throw new Error("MQTT broker is not connected — cannot reach devices right now");
    }

    const routing = await this.resolveRouting(deviceId);
    if (!routing) {
      throw new Error(`Device ${deviceId} is not provisioned`);
    }

    const topic = deviceTopic(routing.hardwareId, "commands");
    const payload = JSON.stringify({ ...command, deviceId: routing.hardwareId });

    return new Promise<void>((resolve, reject) => {
      this.client?.publish(topic, payload, { qos: 1 }, (error) => {
        if (error) {
          this.logger.error(`Failed to publish command: ${error.message}`);
          reject(error);
        } else {
          this.logger.debug(`Published command ${command.command} to ${topic}`);
          resolve();
        }
      });
    });
  }

  private static readonly MAX_TRACKED_SESSIONS = 1000;
}
