import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import { MeasurementType, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { MqttIngestionService } from "../mqtt/mqtt.ingestion.service";
import {
  DeviceCommand,
  DeviceCommandMessage,
  DeviceCommandParameters,
  ECG_MAX_DURATION_SECONDS,
  ECG_MIN_DURATION_SECONDS,
  PROTOCOL_VERSION,
} from "@health-platform/protocol";
import { v4 as uuidv4 } from "uuid";
import * as bcrypt from "bcrypt";
import { MEASUREMENT_TYPES } from "../measurements/measurement-types";

@Injectable()
export class IndividualUsersService {
  private static readonly OFFLINE_AFTER_MS = 90_000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mqtt: MqttIngestionService,
  ) {}

  private isOnline(lastSeenAt: Date | null): boolean {
    if (!lastSeenAt) return false;
    return Date.now() - lastSeenAt.getTime() < IndividualUsersService.OFFLINE_AFTER_MS;
  }

  async assertOwnsDevice(individualUserId: string, deviceId: string) {
    const link = await this.prisma.individualUserDevice.findUnique({
      where: { individualUserId_deviceId: { individualUserId, deviceId } },
    });
    if (!link) throw new ForbiddenException("Device is not paired to this account");
  }

  async getDevices(individualUserId: string) {
    const links = await this.prisma.individualUserDevice.findMany({
      where: { individualUserId },
      include: { device: true },
      orderBy: { pairedAt: "desc" },
    });
    return links.map((l) => ({
      deviceId: l.deviceId,
      hardwareId: l.device.hardwareId,
      pairingCode: l.device.pairingCode,
      lastSeenAt: l.device.lastSeenAt,
      online: this.isOnline(l.device.lastSeenAt),
      pairedAt: l.pairedAt,
    }));
  }

  async pairDevice(individualUserId: string, pairingCode: string) {
    const device = await this.prisma.device.findUnique({ where: { pairingCode } });
    if (!device) throw new NotFoundException("Device not found");

    const existing = await this.prisma.individualUserDevice.findUnique({
      where: { individualUserId_deviceId: { individualUserId, deviceId: device.id } },
    });
    if (existing) throw new ConflictException("Device already paired");

    const pairedElsewhere = await this.prisma.individualUserDevice.findFirst({
      where: { deviceId: device.id },
    });
    if (pairedElsewhere) throw new ConflictException("Device is paired to another account");

    // Also check patient links
    const patientLink = await this.prisma.patientDevice.findFirst({
      where: { deviceId: device.id },
    });
    if (patientLink) throw new ConflictException("Device is paired to another account");

    await this.prisma.individualUserDevice.create({
      data: { individualUserId, deviceId: device.id },
    });

    this.mqtt.invalidateDeviceRouting(device.id);

    return {
      deviceId: device.id,
      pairingCode: device.pairingCode,
      individualUserId,
      pairedAt: new Date(),
    };
  }

  async unpairDevice(individualUserId: string, deviceId: string) {
    const link = await this.prisma.individualUserDevice.findUnique({
      where: { individualUserId_deviceId: { individualUserId, deviceId } },
    });
    if (!link) throw new NotFoundException("Device not paired to this account");

    await this.prisma.individualUserDevice.delete({
      where: { individualUserId_deviceId: { individualUserId, deviceId } },
    });
    this.mqtt.invalidateDeviceRouting(deviceId);
    return { success: true };
  }

  async sendCommand(
    individualUserId: string,
    deviceId: string,
    command: DeviceCommand,
    durationSeconds?: number,
  ) {
    await this.assertOwnsDevice(individualUserId, deviceId);

    const device = await this.prisma.device.findUnique({ where: { id: deviceId } });
    if (!device) throw new NotFoundException("Device not found");
    if (!this.isOnline(device.lastSeenAt))
      throw new ConflictException("Device is offline");

    const parameters: DeviceCommandParameters = {};
    if (command === "START_ECG" && durationSeconds !== undefined) {
      if (
        !Number.isInteger(durationSeconds) ||
        durationSeconds < ECG_MIN_DURATION_SECONDS ||
        durationSeconds > ECG_MAX_DURATION_SECONDS
      ) {
        throw new BadRequestException(`durationSeconds must be between ${ECG_MIN_DURATION_SECONDS} and ${ECG_MAX_DURATION_SECONDS}`);
      }
      parameters.durationSeconds = durationSeconds;
    }

    const commandId = uuidv4();
    const message: DeviceCommandMessage = {
      protocolVersion: PROTOCOL_VERSION,
      messageId: uuidv4(),
      deviceId,
      timestamp: new Date().toISOString(),
      commandId,
      command,
      parameters: Object.keys(parameters).length > 0 ? parameters : undefined,
    };

    await this.mqtt.publishCommand(deviceId, message);

    if (command === "STOP_ECG") {
      await this.prisma.individualEcgSession.updateMany({
        where: { deviceId, endedAt: null },
        data: { endedAt: new Date() },
      });
    }

    await this.prisma.auditLog.create({
      data: {
        action: "DEVICE_COMMAND",
        resource: `device:${deviceId}`,
        metadata: { commandId, command, individualUserId },
      },
    });

    return { commandId, command, deviceId, sentAt: message.timestamp };
  }

  async getMeasurements(
    individualUserId: string,
    options: { type?: MeasurementType; limit?: number; startDate?: Date; endDate?: Date } = {},
  ) {
    const where: Prisma.IndividualMeasurementWhereInput = { individualUserId };
    if (options.type) where.type = options.type;
    if (options.startDate || options.endDate) {
      where.measuredAt = {};
      if (options.startDate) where.measuredAt.gte = options.startDate;
      if (options.endDate) where.measuredAt.lte = options.endDate;
    }
    return this.prisma.individualMeasurement.findMany({
      where,
      orderBy: { measuredAt: "desc" },
      take: options.limit ?? 100,
      include: { device: { select: { hardwareId: true } } },
    });
  }

  async getSummary(individualUserId: string) {
    const types: readonly MeasurementType[] = MEASUREMENT_TYPES;
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

    return Promise.all(
      types.map(async (type) => {
        const latest = await this.prisma.individualMeasurement.findFirst({
          where: { individualUserId, type },
          orderBy: { measuredAt: "desc" },
          select: { value: true, unit: true, quality: true, measuredAt: true },
        });

        const baseline = await this.prisma.individualMeasurement.aggregate({
          where: { individualUserId, type, quality: "VALID", measuredAt: { gte: since } },
          _avg: { value: true },
          _min: { value: true },
          _max: { value: true },
          _count: true,
        });

        const average = baseline._avg.value;
        return {
          type,
          latest: latest ?? null,
          baseline:
            baseline._count > 0 && average !== null
              ? { average: Math.round(average * 100) / 100, min: baseline._min.value, max: baseline._max.value, sampleCount: baseline._count, days: 14 }
              : null,
          deviationFromBaseline:
            latest && average !== null && average !== 0
              ? Math.round(((latest.value - average) / average) * 1000) / 10
              : null,
        };
      }),
    );
  }

  async getTrends(individualUserId: string, type: MeasurementType, days: number) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const rows = await this.prisma.$queryRaw<
      Array<{ day: Date; min: number; avg: number; max: number; count: bigint }>
    >`
      SELECT
        date_trunc('day', "measuredAt") AS day,
        MIN("value")::float8            AS min,
        AVG("value")::float8            AS avg,
        MAX("value")::float8            AS max,
        COUNT(*)                        AS count
      FROM "IndividualMeasurement"
      WHERE "individualUserId" = ${individualUserId}
        AND "type" = ${type}::"MeasurementType"
        AND "quality" = 'VALID'
        AND "measuredAt" >= ${since}
      GROUP BY 1
      ORDER BY 1 ASC
    `;
    return rows.map((r) => ({
      day: r.day,
      min: r.min,
      avg: Math.round(r.avg * 100) / 100,
      max: r.max,
      count: Number(r.count),
    }));
  }

  async getEcgSessions(individualUserId: string, options: { limit?: number } = {}) {
    const sessions = await this.prisma.individualEcgSession.findMany({
      where: { individualUserId },
      orderBy: { startedAt: "desc" },
      take: options.limit ?? 20,
      include: {
        device: { select: { hardwareId: true } },
        _count: { select: { chunks: true } },
      },
    });
    return sessions.map((s) => ({
      id: s.id,
      deviceId: s.deviceId,
      hardwareId: s.device.hardwareId,
      sampleRate: s.sampleRate,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      inProgress: s.endedAt === null,
      chunkCount: s._count.chunks,
      durationSeconds: s.endedAt
        ? Math.round((s.endedAt.getTime() - s.startedAt.getTime()) / 1000)
        : null,
    }));
  }

  async getEcgSessionById(sessionId: string, individualUserId: string) {
    const session = await this.prisma.individualEcgSession.findUnique({
      where: { id: sessionId },
      include: {
        device: { select: { hardwareId: true } },
        chunks: { orderBy: { sequence: "asc" } },
      },
    });
    if (!session || session.individualUserId !== individualUserId) {
      throw new NotFoundException("ECG session not found");
    }
    const samples: number[] = [];
    for (const chunk of session.chunks) {
      if (Array.isArray(chunk.samples)) {
        for (const v of chunk.samples as unknown[]) {
          if (typeof v === "number") samples.push(v);
        }
      }
    }
    return {
      id: session.id,
      deviceId: session.deviceId,
      hardwareId: session.device.hardwareId,
      sampleRate: session.sampleRate,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      inProgress: session.endedAt === null,
      chunkCount: session.chunks.length,
      sampleCount: samples.length,
      durationSeconds: session.sampleRate > 0 ? samples.length / session.sampleRate : 0,
      samples,
    };
  }
}
