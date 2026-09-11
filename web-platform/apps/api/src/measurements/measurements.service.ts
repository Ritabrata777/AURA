import { Injectable, NotFoundException } from "@nestjs/common";
import { MeasurementType, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { MEASUREMENT_TYPES } from "./measurement-types";

export interface MeasurementQueryOptions {
  type?: MeasurementType;
  limit?: number;
  startDate?: Date;
  endDate?: Date;
}

export interface EcgQueryOptions {
  limit?: number;
  startDate?: Date;
  endDate?: Date;
}

@Injectable()
export class MeasurementsService {
  /** Hard ceiling so a client cannot ask for the entire history in one call. */
  private static readonly MAX_LIMIT = 500;
  private static readonly DEFAULT_LIMIT = 100;
  private static readonly MAX_ECG_SESSIONS = 100;

  constructor(private readonly prisma: PrismaService) {}

  async getPatientMeasurements(patientId: string, options?: MeasurementQueryOptions) {
    const where: Prisma.MeasurementWhereInput = { patientId };

    if (options?.type) {
      where.type = options.type;
    }

    if (options?.startDate || options?.endDate) {
      where.measuredAt = {};
      if (options.startDate) where.measuredAt.gte = options.startDate;
      if (options.endDate) where.measuredAt.lte = options.endDate;
    }

    return this.prisma.measurement.findMany({
      where,
      orderBy: { measuredAt: "desc" },
      take: this.clampLimit(options?.limit, MeasurementsService.DEFAULT_LIMIT),
      include: {
        device: {
          select: { hardwareId: true },
        },
      },
    });
  }

  /**
   * Lists ECG sessions as metadata only.
   *
   * The previous version eagerly included `chunks`, so a request for 20
   * sessions could pull hundreds of thousands of raw samples through Postgres,
   * Nest, and JSON serialization in one response. Callers fetch waveform data
   * per session via `getECGSessionById`.
   */
  async getPatientECGSessions(patientId: string, options?: EcgQueryOptions) {
    const where: Prisma.EcgSessionWhereInput = { patientId };

    if (options?.startDate || options?.endDate) {
      where.startedAt = {};
      if (options.startDate) where.startedAt.gte = options.startDate;
      if (options.endDate) where.startedAt.lte = options.endDate;
    }

    const sessions = await this.prisma.ecgSession.findMany({
      where,
      orderBy: { startedAt: "desc" },
      take: this.clampLimit(options?.limit, 20, MeasurementsService.MAX_ECG_SESSIONS),
      include: {
        device: { select: { hardwareId: true } },
        _count: { select: { chunks: true } },
      },
    });

    return sessions.map((session) => ({
      id: session.id,
      deviceId: session.deviceId,
      hardwareId: session.device.hardwareId,
      sampleRate: session.sampleRate,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      inProgress: session.endedAt === null,
      chunkCount: session._count.chunks,
      durationSeconds: session.endedAt
        ? Math.round((session.endedAt.getTime() - session.startedAt.getTime()) / 1000)
        : null,
    }));
  }

  async getECGSessionById(sessionId: string, patientId: string) {
    const session = await this.prisma.ecgSession.findUnique({
      where: { id: sessionId },
      include: {
        device: { select: { hardwareId: true } },
        chunks: { orderBy: { sequence: "asc" } },
      },
    });

    // Returning 404 rather than 403 for another patient's session avoids
    // confirming that the id exists.
    if (!session || session.patientId !== patientId) {
      throw new NotFoundException("ECG session not found");
    }

    // Flatten chunks into one ordered sample array so clients do not have to
    // reassemble the waveform themselves.
    const samples: number[] = [];
    for (const chunk of session.chunks) {
      if (Array.isArray(chunk.samples)) {
        for (const value of chunk.samples as unknown[]) {
          if (typeof value === "number") samples.push(value);
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

  async getLatestMeasurements(patientId: string) {
    const [heartRate, spo2, temperature] = await Promise.all([
      this.latestOfType(patientId, "HEART_RATE"),
      this.latestOfType(patientId, "SPO2"),
      this.latestOfType(patientId, "TEMPERATURE"),
    ]);

    return { heartRate, spo2, temperature };
  }

  /**
   * Daily min/avg/max per measurement type — the shape a trend chart needs.
   * Computed in Postgres so the API never materializes the raw rows.
   */
  async getTrends(patientId: string, type: MeasurementType, days: number) {
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
      FROM "Measurement"
      WHERE "patientId" = ${patientId}
        AND "type" = ${type}::"MeasurementType"
        AND "quality" = 'VALID'
        AND "measuredAt" >= ${since}
      GROUP BY 1
      ORDER BY 1 ASC
    `;

    return rows.map((row) => ({
      day: row.day,
      min: row.min,
      avg: Math.round(row.avg * 100) / 100,
      max: row.max,
      count: Number(row.count),
    }));
  }

  /**
   * Rolling summary used by the dashboard header: latest reading per type plus
   * how it compares to the patient's own recent baseline. "Normal" for one
   * person is not normal for another, so the comparison is self-relative
   * rather than against population reference ranges.
   */
  async getVitalsSummary(patientId: string, baselineDays = 14) {
    const since = new Date(Date.now() - baselineDays * 24 * 60 * 60 * 1000);
    const types: readonly MeasurementType[] = MEASUREMENT_TYPES;

    const results = await Promise.all(
      types.map(async (type) => {
        const [latest, baseline] = await Promise.all([
          this.latestOfType(patientId, type),
          this.prisma.measurement.aggregate({
            where: { patientId, type, quality: "VALID", measuredAt: { gte: since } },
            _avg: { value: true },
            _min: { value: true },
            _max: { value: true },
            _count: true,
          }),
        ]);

        const average = baseline._avg.value;

        return {
          type,
          latest,
          baseline:
            baseline._count > 0 && average !== null
              ? {
                  average: Math.round(average * 100) / 100,
                  min: baseline._min.value,
                  max: baseline._max.value,
                  sampleCount: baseline._count,
                  days: baselineDays,
                }
              : null,
          deviationFromBaseline:
            latest && average !== null && average !== 0
              ? Math.round(((latest.value - average) / average) * 1000) / 10
              : null,
        };
      }),
    );

    return results;
  }

  private async latestOfType(patientId: string, type: MeasurementType) {
    const measurement = await this.prisma.measurement.findFirst({
      where: { patientId, type },
      orderBy: { measuredAt: "desc" },
      select: { value: true, unit: true, quality: true, measuredAt: true },
    });

    return measurement ?? null;
  }

  private clampLimit(
    requested: number | undefined,
    fallback: number,
    max: number = MeasurementsService.MAX_LIMIT,
  ): number {
    if (requested === undefined || !Number.isFinite(requested) || requested <= 0) {
      return fallback;
    }
    return Math.min(Math.floor(requested), max);
  }
}
