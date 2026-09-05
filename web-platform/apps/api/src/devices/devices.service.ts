import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import * as bcrypt from "bcrypt";
import { v4 as uuidv4 } from "uuid";
import {
  DeviceCommand,
  DeviceCommandMessage,
  DeviceCommandParameters,
  ECG_MAX_DURATION_SECONDS,
  ECG_MIN_DURATION_SECONDS,
  PROTOCOL_VERSION,
} from "@health-platform/protocol";
import { MqttIngestionService } from "../mqtt/mqtt.ingestion.service";

export interface ProvisionDeviceDto {
  hardwareId: string;
  pairingCode: string;
  credential: string;
}

export interface PairDeviceDto {
  pairingCode: string;
  patientId: string;
}

export interface SendCommandDto {
  command: DeviceCommand;
  durationSeconds?: number;
}

@Injectable()
export class DevicesService {
  private readonly logger = new Logger(DevicesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mqtt: MqttIngestionService,
  ) {}

  async provisionDevice(dto: ProvisionDeviceDto) {
    const existing = await this.prisma.device.findFirst({
      where: {
        OR: [
          { hardwareId: dto.hardwareId },
          { pairingCode: dto.pairingCode },
        ],
      },
    });

    if (existing) {
      throw new ConflictException("Device already provisioned");
    }

    const credentialHash = await bcrypt.hash(dto.credential, 10);
    const deviceId = uuidv4();

    const device = await this.prisma.device.create({
      data: {
        id: deviceId,
        hardwareId: dto.hardwareId,
        pairingCode: dto.pairingCode,
        credentialHash,
      },
    });

    return {
      deviceId: device.id,
      hardwareId: device.hardwareId,
      pairingCode: device.pairingCode,
    };
  }

  async pairDevice(dto: PairDeviceDto) {
    const device = await this.prisma.device.findUnique({
      where: { pairingCode: dto.pairingCode },
    });

    if (!device) {
      throw new NotFoundException("Device not found");
    }

    const patient = await this.prisma.patient.findUnique({
      where: { id: dto.patientId },
    });

    if (!patient) {
      throw new NotFoundException("Patient not found");
    }

    const existingPair = await this.prisma.patientDevice.findUnique({
      where: {
        patientId_deviceId: {
          patientId: dto.patientId,
          deviceId: device.id,
        },
      },
    });

    if (existingPair) {
      throw new ConflictException("Device already paired to this patient");
    }

    // A device streams one person's vitals; letting a second patient claim an
    // already-paired device would silently mix two people's health records.
    const pairedElsewhere = await this.prisma.patientDevice.findFirst({
      where: { deviceId: device.id },
    });

    if (pairedElsewhere) {
      throw new ConflictException("Device is already paired to another patient");
    }

    await this.prisma.patientDevice.create({
      data: {
        patientId: dto.patientId,
        deviceId: device.id,
      },
    });

    // The ingestion service caches device→patient routing for a minute. Without
    // this, a device paired seconds ago keeps being treated as unclaimed and its
    // measurements are discarded until the entry expires on its own.
    this.mqtt.invalidateDeviceRouting(device.id);

    return {
      deviceId: device.id,
      pairingCode: device.pairingCode,
      patientId: dto.patientId,
      pairedAt: new Date(),
    };
  }

  async getPatientDevices(patientId: string) {
    const links = await this.prisma.patientDevice.findMany({
      where: { patientId },
      include: { device: true },
      orderBy: { pairedAt: "desc" },
    });

    // `credentialHash` must never leave the server, so project explicitly
    // rather than returning the whole device row.
    return links.map((link) => ({
      deviceId: link.deviceId,
      hardwareId: link.device.hardwareId,
      pairingCode: link.device.pairingCode,
      lastSeenAt: link.device.lastSeenAt,
      online: this.isOnline(link.device.lastSeenAt),
      pairedAt: link.pairedAt,
    }));
  }

  async unpairDevice(patientId: string, deviceId: string) {
    const link = await this.prisma.patientDevice.findUnique({
      where: { patientId_deviceId: { patientId, deviceId } },
    });

    if (!link) {
      throw new NotFoundException("Device is not paired to this patient");
    }

    await this.prisma.patientDevice.delete({
      where: { patientId_deviceId: { patientId, deviceId } },
    });

    // Symmetrically to pairing: stop routing this device's data to a patient
    // who just gave it up, rather than waiting out the cache TTL.
    this.mqtt.invalidateDeviceRouting(deviceId);

    return { success: true };
  }

  /**
   * Throws unless the device is paired to this patient. Every device-scoped
   * read and command routes through here; previously `getDeviceStatus` had no
   * ownership check at all, so any logged-in user could enumerate devices.
   */
  async assertPatientOwnsDevice(patientId: string, deviceId: string) {
    const link = await this.prisma.patientDevice.findUnique({
      where: { patientId_deviceId: { patientId, deviceId } },
    });

    if (!link) {
      throw new ForbiddenException("Device is not paired to this account");
    }
  }

  async getDeviceStatus(deviceId: string, patientId: string) {
    await this.assertPatientOwnsDevice(patientId, deviceId);

    const device = await this.prisma.device.findUnique({
      where: { id: deviceId },
    });

    if (!device) {
      throw new NotFoundException("Device not found");
    }

    const activeSession = await this.prisma.ecgSession.findFirst({
      where: { deviceId, endedAt: null },
      orderBy: { startedAt: "desc" },
      select: { id: true, startedAt: true, sampleRate: true },
    });

    return {
      id: device.id,
      hardwareId: device.hardwareId,
      pairingCode: device.pairingCode,
      lastSeenAt: device.lastSeenAt,
      online: this.isOnline(device.lastSeenAt),
      activeEcgSession: activeSession,
    };
  }

  /**
   * Sends a command to a paired device over MQTT and records it so the ACK can
   * be correlated. Returns the generated commandId; the device's ACK arrives
   * asynchronously on the `command:ack` websocket event.
   */
  async sendCommand(patientId: string, deviceId: string, dto: SendCommandDto) {
    await this.assertPatientOwnsDevice(patientId, deviceId);

    const device = await this.prisma.device.findUnique({ where: { id: deviceId } });
    if (!device) {
      throw new NotFoundException("Device not found");
    }

    if (!this.isOnline(device.lastSeenAt)) {
      throw new ConflictException(
        "Device is offline — it has not reported status recently",
      );
    }

    const parameters: DeviceCommandParameters = {};

    if (dto.command === "START_ECG" && dto.durationSeconds !== undefined) {
      if (
        !Number.isInteger(dto.durationSeconds) ||
        dto.durationSeconds < ECG_MIN_DURATION_SECONDS ||
        dto.durationSeconds > ECG_MAX_DURATION_SECONDS
      ) {
        throw new BadRequestException(
          `durationSeconds must be an integer between ${ECG_MIN_DURATION_SECONDS} and ${ECG_MAX_DURATION_SECONDS}`,
        );
      }
      parameters.durationSeconds = dto.durationSeconds;
    }

    const commandId = uuidv4();
    const message: DeviceCommandMessage = {
      protocolVersion: PROTOCOL_VERSION,
      messageId: uuidv4(),
      deviceId,
      timestamp: new Date().toISOString(),
      commandId,
      command: dto.command,
      parameters: Object.keys(parameters).length > 0 ? parameters : undefined,
    };

    await this.mqtt.publishCommand(deviceId, message);

    // STOP_ECG closes the open session immediately rather than waiting for the
    // device ACK, so the history view never shows a session running forever if
    // the device drops off before acknowledging.
    if (dto.command === "STOP_ECG") {
      await this.closeOpenEcgSessions(deviceId);
    }

    await this.prisma.auditLog.create({
      data: {
        userId: null,
        action: "DEVICE_COMMAND",
        resource: `device:${deviceId}`,
        metadata: {
          commandId,
          command: dto.command,
          patientId,
          ...(parameters.durationSeconds !== undefined
            ? { durationSeconds: parameters.durationSeconds }
            : {}),
        },
      },
    });

    this.logger.log(`Sent ${dto.command} to device ${deviceId} (commandId=${commandId})`);

    return {
      commandId,
      command: dto.command,
      deviceId,
      sentAt: message.timestamp,
      parameters: message.parameters ?? null,
    };
  }

  private async closeOpenEcgSessions(deviceId: string) {
    await this.prisma.ecgSession.updateMany({
      where: { deviceId, endedAt: null },
      data: { endedAt: new Date() },
    });
  }

  /**
   * A device publishes status every few seconds, so a gap beyond this window
   * means it is off, asleep, or out of Wi-Fi range.
   */
  private isOnline(lastSeenAt: Date | null): boolean {
    if (!lastSeenAt) return false;
    return Date.now() - lastSeenAt.getTime() < DevicesService.OFFLINE_AFTER_MS;
  }

  private static readonly OFFLINE_AFTER_MS = 90_000;
}
