import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class MeasurementsService {
  constructor(private readonly prisma: PrismaService) {}

  async getPatientMeasurements(patientId: string, options?: {
    type?: string;
    limit?: number;
    startDate?: Date;
    endDate?: Date;
  }) {
    const where: any = { patientId };

    if (options?.type) {
      where.type = options.type;
    }

    if (options?.startDate || options?.endDate) {
      where.measuredAt = {};
      if (options?.startDate) where.measuredAt.gte = options.startDate;
      if (options?.endDate) where.measuredAt.lte = options.endDate;
    }

    return this.prisma.measurement.findMany({
      where,
      orderBy: { measuredAt: "desc" },
      take: options?.limit || 100,
      include: {
        device: {
          select: {
            hardwareId: true,
            pairingCode: true,
          },
        },
      },
    });
  }

  async getPatientECGSessions(patientId: string, options?: {
    limit?: number;
    startDate?: Date;
    endDate?: Date;
  }) {
    const where: any = { patientId };

    if (options?.startDate || options?.endDate) {
      where.startedAt = {};
      if (options?.startDate) where.startedAt.gte = options.startDate;
      if (options?.endDate) where.startedAt.lte = options.endDate;
    }

    return this.prisma.ecgSession.findMany({
      where,
      orderBy: { startedAt: "desc" },
      take: options?.limit || 20,
      include: {
        device: {
          select: {
            hardwareId: true,
            pairingCode: true,
          },
        },
        chunks: {
          orderBy: { sequence: "asc" },
          take: options?.limit ? 100 : undefined,
        },
      },
    });
  }

  async getECGSessionById(sessionId: string, patientId: string) {
    const session = await this.prisma.ecgSession.findUnique({
      where: { id: sessionId },
      include: {
        device: {
          select: {
            hardwareId: true,
            pairingCode: true,
          },
        },
        chunks: {
          orderBy: { sequence: "asc" },
        },
      },
    });

    if (!session || session.patientId !== patientId) {
      throw new NotFoundException("ECG session not found");
    }

    return session;
  }

  async getLatestMeasurements(patientId: string) {
    const [heartRate, spo2, temperature] = await Promise.all([
      this.prisma.measurement.findFirst({
        where: { patientId, type: "HEART_RATE" },
        orderBy: { measuredAt: "desc" },
      }),
      this.prisma.measurement.findFirst({
        where: { patientId, type: "SPO2" },
        orderBy: { measuredAt: "desc" },
      }),
      this.prisma.measurement.findFirst({
        where: { patientId, type: "TEMPERATURE" },
        orderBy: { measuredAt: "desc" },
      }),
    ]);

    return {
      heartRate: heartRate ? {
        value: heartRate.value,
        unit: heartRate.unit,
        quality: heartRate.quality,
        measuredAt: heartRate.measuredAt,
      } : null,
      spo2: spo2 ? {
        value: spo2.value,
        unit: spo2.unit,
        quality: spo2.quality,
        measuredAt: spo2.measuredAt,
      } : null,
      temperature: temperature ? {
        value: temperature.value,
        unit: temperature.unit,
        quality: temperature.quality,
        measuredAt: temperature.measuredAt,
      } : null,
    };
  }
}
