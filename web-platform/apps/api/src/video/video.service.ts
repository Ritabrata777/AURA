import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DoctorsService } from "../doctors/doctors.service";
import { PrismaService } from "../prisma/prisma.service";
import { v4 as uuidv4 } from "uuid";

// GetStream server-side token generation (simplified — in production use @stream-io/node-sdk)
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
    this.apiKey = this.configService.get<string>("GETSTREAM_API_KEY") || "";
    this.apiSecret = this.configService.get<string>("GETSTREAM_API_SECRET") || "";
  }

  private generateToken(userId: string, expirationSeconds: number = 3600): string {
    if (!this.apiKey || !this.apiSecret) {
      // A bare `Error` here surfaced as an opaque 500 "Internal server error",
      // which reads as a crash rather than the deployment gap it actually is.
      throw new ServiceUnavailableException(
        "Video calling is not configured on this server (missing GetStream credentials)",
      );
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

  /**
   * `Appointment.patientId` / `doctorId` are foreign keys onto **User**, not
   * onto Patient/Doctor. The service previously stored Patient and Doctor ids
   * in those columns, which fails the foreign key on write and silently
   * matches nothing on read. These helpers translate between the two.
   */
  private async userIdForPatient(patientId: string): Promise<string> {
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
      select: { userId: true },
    });
    if (!patient) {
      throw new NotFoundException("Patient not found");
    }
    return patient.userId;
  }

  private async userIdForDoctor(doctorId: string): Promise<string> {
    const doctor = await this.prisma.doctor.findUnique({
      where: { id: doctorId },
      select: { userId: true },
    });
    if (!doctor) {
      throw new NotFoundException("Doctor not found");
    }
    return doctor.userId;
  }

  async createConsultationCall(doctorId: string, patientId: string, startsAt: Date, endsAt: Date) {
    const isAuthorized = await this.doctorsService.isAuthorizedDoctor(doctorId, patientId);

    if (!isAuthorized) {
      throw new ForbiddenException("Doctor is not authorized to consult with this patient");
    }

    if (endsAt <= startsAt) {
      throw new ForbiddenException("Consultation must end after it starts");
    }

    const [patientUserId, doctorUserId] = await Promise.all([
      this.userIdForPatient(patientId),
      this.userIdForDoctor(doctorId),
    ]);

    const callId = uuidv4();

    const appointment = await this.prisma.appointment.create({
      data: {
        patientId: patientUserId,
        doctorId: doctorUserId,
        startsAt,
        endsAt,
        streamCallId: callId,
        status: "SCHEDULED",
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: doctorUserId,
        action: "CONSULTATION_SCHEDULED",
        resource: `appointment:${appointment.id}`,
        metadata: { callId, patientId, doctorId },
      },
    });

    return {
      callId: appointment.streamCallId,
      appointmentId: appointment.id,
      startsAt: appointment.startsAt,
      endsAt: appointment.endsAt,
    };
  }

  /**
   * A call token is a key into a live consultation room. It is only issued to
   * a user who is actually a participant in that appointment, and only while
   * the appointment window is open — the previous implementation minted a
   * token for any callId a logged-in user could guess or observe.
   */
  async getConsultationToken(userId: string, callId: string, role: "patient" | "doctor") {
    const appointment = await this.prisma.appointment.findFirst({
      where: { streamCallId: callId },
    });

    if (!appointment) {
      throw new NotFoundException("Consultation not found");
    }

    if (appointment.patientId !== userId && appointment.doctorId !== userId) {
      throw new ForbiddenException("You are not a participant in this consultation");
    }

    if (appointment.status !== "SCHEDULED") {
      throw new ForbiddenException(`Consultation is ${appointment.status.toLowerCase()}`);
    }

    // Allow joining a few minutes early, and expire the token with the call.
    const now = Date.now();
    const joinOpensAt = appointment.startsAt.getTime() - VideoService.EARLY_JOIN_MS;
    const endsAt = appointment.endsAt.getTime();

    if (now < joinOpensAt) {
      throw new ForbiddenException("Consultation has not opened yet");
    }
    if (now > endsAt) {
      throw new ForbiddenException("Consultation has ended");
    }

    const secondsRemaining = Math.max(60, Math.ceil((endsAt - now) / 1000));
    const token = this.generateToken(userId, secondsRemaining);

    await this.prisma.auditLog.create({
      data: {
        userId,
        action: "CONSULTATION_TOKEN_ISSUED",
        resource: `appointment:${appointment.id}`,
        metadata: { callId, role },
      },
    });

    return {
      apiKey: this.apiKey,
      token,
      callId,
      role,
      expiresInSeconds: secondsRemaining,
    };
  }

  async getActiveConsultation(patientId: string) {
    const patientUserId = await this.userIdForPatient(patientId);
    const now = new Date();

    const appointment = await this.prisma.appointment.findFirst({
      where: {
        patientId: patientUserId,
        startsAt: { lte: new Date(now.getTime() + VideoService.EARLY_JOIN_MS) },
        endsAt: { gte: now },
        status: "SCHEDULED",
        streamCallId: { not: null },
      },
      orderBy: { startsAt: "asc" },
      include: { doctor: { select: { id: true, email: true } } },
    });

    if (!appointment) {
      return null;
    }

    return {
      callId: appointment.streamCallId,
      appointmentId: appointment.id,
      doctor: {
        id: appointment.doctor.id,
        email: appointment.doctor.email,
      },
      startsAt: appointment.startsAt,
      endsAt: appointment.endsAt,
    };
  }

  async getDoctorActiveConsultation(doctorId: string) {
    const doctorUserId = await this.userIdForDoctor(doctorId);
    const now = new Date();

    const appointment = await this.prisma.appointment.findFirst({
      where: {
        doctorId: doctorUserId,
        startsAt: { lte: new Date(now.getTime() + VideoService.EARLY_JOIN_MS) },
        endsAt: { gte: now },
        status: "SCHEDULED",
        streamCallId: { not: null },
      },
      orderBy: { startsAt: "asc" },
      include: { patient: { select: { id: true, email: true } } },
    });

    if (!appointment) {
      return null;
    }

    return {
      callId: appointment.streamCallId,
      appointmentId: appointment.id,
      patient: {
        id: appointment.patient.id,
        email: appointment.patient.email,
      },
      startsAt: appointment.startsAt,
      endsAt: appointment.endsAt,
    };
  }

  /** Participants may join this long before the scheduled start. */
  private static readonly EARLY_JOIN_MS = 5 * 60 * 1000;
}
