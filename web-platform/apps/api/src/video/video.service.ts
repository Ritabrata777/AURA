import { Injectable, ForbiddenException, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DoctorsService } from "../doctors/doctors.service";
import { PrismaService } from "../prisma/prisma.service";
import { v4 as uuidv4 } from "uuid";

// GetStream server-side token generation (simplified - in production use @stream-io/node-sdk)
import * as crypto from "crypto";

@Injectable()
export class VideoService {
  private readonly apiKey: string;
  private readonly apiSecret: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly doctorsService: DoctorsService,
    private readonly prisma: PrismaService,
  ) {
    this.apiKey = this.configService.get("GETSTREAM_API_KEY") || "";
    this.apiSecret = this.configService.get("GETSTREAM_API_SECRET") || "";
  }

  private generateToken(userId: string, expirationSeconds: number = 3600): string {
    if (!this.apiKey || !this.apiSecret) {
      throw new Error("GetStream credentials not configured");
    }

    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const now = Math.floor(Date.now() / 1000);
    
    const payload = Buffer.from(JSON.stringify({
      user_id: userId,
      exp: now + expirationSeconds,
      iat: now,
    })).toString("base64url");

    const signature = crypto
      .createHmac("sha256", this.apiSecret)
      .update(`${header}.${payload}`)
      .digest("base64url");

    return `${header}.${payload}.${signature}`;
  }

  async createConsultationCall(doctorId: string, patientId: string, startsAt: Date, endsAt: Date) {
    const isAuthorized = await this.doctorsService.isAuthorizedDoctor(doctorId, patientId);
    
    if (!isAuthorized) {
      throw new ForbiddenException("Doctor is not authorized to consult with this patient");
    }

    const callId = uuidv4();
    
    const appointment = await this.prisma.appointment.create({
      data: {
        patientId,
        doctorId,
        startsAt,
        endsAt,
        streamCallId: callId,
        status: "SCHEDULED",
      },
    });

    return {
      callId: appointment.streamCallId,
      startsAt: appointment.startsAt,
      endsAt: appointment.endsAt,
    };
  }

  async getConsultationToken(userId: string, callId: string, role: "patient" | "doctor") {
    const token = this.generateToken(userId);
    
    return {
      apiKey: this.apiKey,
      token,
      callId,
      role,
    };
  }

  async getActiveConsultation(patientId: string) {
    const now = new Date();
    
    const appointment = await this.prisma.appointment.findFirst({
      where: {
        patientId,
        startsAt: { lte: now },
        endsAt: { gte: now },
        status: "SCHEDULED",
        streamCallId: { not: null },
      },
      include: {
        doctor: true,
      },
    });

    if (!appointment) {
      return null;
    }

    return {
      callId: appointment.streamCallId,
      doctor: {
        id: appointment.doctorId,
        email: appointment.doctor.email,
      },
      startsAt: appointment.startsAt,
      endsAt: appointment.endsAt,
    };
  }

  async getDoctorActiveConsultation(doctorId: string) {
    const now = new Date();
    
    const appointment = await this.prisma.appointment.findFirst({
      where: {
        doctorId,
        startsAt: { lte: now },
        endsAt: { gte: now },
        status: "SCHEDULED",
        streamCallId: { not: null },
      },
      include: {
        patient: {
          select: {
            email: true,
          },
        },
      },
    });

    if (!appointment) {
      return null;
    }

    return {
      callId: appointment.streamCallId,
      patient: {
        email: appointment.patient.email,
      },
      startsAt: appointment.startsAt,
      endsAt: appointment.endsAt,
    };
  }
}
