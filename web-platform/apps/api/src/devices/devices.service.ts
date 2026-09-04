import { Injectable, NotFoundException, ConflictException, UnauthorizedException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import * as bcrypt from "bcrypt";
import { v4 as uuidv4 } from "uuid";

export interface ProvisionDeviceDto {
  hardwareId: string;
  pairingCode: string;
  credential: string;
}

export interface PairDeviceDto {
  pairingCode: string;
  patientId: string;
}

@Injectable()
export class DevicesService {
  constructor(private readonly prisma: PrismaService) {}

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

    await this.prisma.patientDevice.create({
      data: {
        patientId: dto.patientId,
        deviceId: device.id,
      },
    });

    return {
      deviceId: device.id,
      pairingCode: device.pairingCode,
      patientId: dto.patientId,
      pairedAt: new Date(),
    };
  }

  async getPatientDevices(patientId: string) {
    return this.prisma.patientDevice.findMany({
      where: { patientId },
      include: {
        device: true,
      },
    });
  }

  async unpairDevice(patientId: string, deviceId: string) {
    await this.prisma.patientDevice.delete({
      where: {
        patientId_deviceId: {
          patientId,
          deviceId,
        },
      },
    });

    return { success: true };
  }

  async getDeviceStatus(deviceId: string) {
    const device = await this.prisma.device.findUnique({
      where: { id: deviceId },
      include: {
        patientLinks: {
          include: {
            patient: {
              include: {
                user: {
                  select: {
                    email: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!device) {
      throw new NotFoundException("Device not found");
    }

    return {
      id: device.id,
      hardwareId: device.hardwareId,
      pairingCode: device.pairingCode,
      lastSeenAt: device.lastSeenAt,
      patient: device.patientLinks.length > 0 ? {
        id: device.patientLinks[0].patientId,
        email: device.patientLinks[0].patient.user.email,
      } : null,
    };
  }
}
