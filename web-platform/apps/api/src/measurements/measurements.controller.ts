import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  ForbiddenException,
  ParseUUIDPipe,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Type } from "class-transformer";
import { IsIn, IsInt, IsISO8601, IsOptional, Max, Min } from "class-validator";
import { MeasurementType } from "@prisma/client";
import { MeasurementsService } from "./measurements.service";
import { DoctorsService } from "../doctors/doctors.service";
import { PrismaService } from "../prisma/prisma.service";
import { AuthenticatedUser } from "../auth/auth.service";
import { CurrentUser } from "../auth/current-user.decorator";
import { MEASUREMENT_TYPES } from "./measurement-types";

// Query params arrive as strings. `@Type(() => Number)` works because main.ts
// enables `transform: true` on the global pipe; without these DTOs the
// handlers parsed `any` by hand and never rejected bad input.
class MeasurementQueryDto {
  @IsOptional()
  @IsIn(MEASUREMENT_TYPES as unknown as string[])
  type?: MeasurementType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;

  @IsOptional()
  @IsISO8601()
  startDate?: string;

  @IsOptional()
  @IsISO8601()
  endDate?: string;
}

class EcgQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsISO8601()
  startDate?: string;

  @IsOptional()
  @IsISO8601()
  endDate?: string;
}

class TrendQueryDto {
  @IsIn(MEASUREMENT_TYPES as unknown as string[])
  type!: MeasurementType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  days?: number;
}

@Controller("measurements")
export class MeasurementsController {
  constructor(
    private readonly measurementsService: MeasurementsService,
    private readonly doctorsService: DoctorsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @UseGuards(AuthGuard("jwt"))
  async getMyMeasurements(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: MeasurementQueryDto,
  ) {
    const patientId = this.requirePatientId(user);

    return this.measurementsService.getPatientMeasurements(patientId, {
      type: query.type,
      limit: query.limit,
      startDate: query.startDate ? new Date(query.startDate) : undefined,
      endDate: query.endDate ? new Date(query.endDate) : undefined,
    });
  }

  @Get("latest")
  @UseGuards(AuthGuard("jwt"))
  async getLatestMeasurements(@CurrentUser() user: AuthenticatedUser) {
    const patientId = this.requirePatientId(user);
    return this.measurementsService.getLatestMeasurements(patientId);
  }

  /** Latest reading per vital plus how it compares to the patient's baseline. */
  @Get("summary")
  @UseGuards(AuthGuard("jwt"))
  async getSummary(@CurrentUser() user: AuthenticatedUser) {
    const patientId = this.requirePatientId(user);
    return this.measurementsService.getVitalsSummary(patientId);
  }

  /** Daily min/avg/max for charting a vital over time. */
  @Get("trends")
  @UseGuards(AuthGuard("jwt"))
  async getTrends(@CurrentUser() user: AuthenticatedUser, @Query() query: TrendQueryDto) {
    const patientId = this.requirePatientId(user);
    return this.measurementsService.getTrends(patientId, query.type, query.days ?? 30);
  }

  @Get("ecg-sessions")
  @UseGuards(AuthGuard("jwt"))
  async getECGSessions(@CurrentUser() user: AuthenticatedUser, @Query() query: EcgQueryDto) {
    const patientId = this.requirePatientId(user);

    return this.measurementsService.getPatientECGSessions(patientId, {
      limit: query.limit,
      startDate: query.startDate ? new Date(query.startDate) : undefined,
      endDate: query.endDate ? new Date(query.endDate) : undefined,
    });
  }

  @Get("ecg-sessions/:sessionId")
  @UseGuards(AuthGuard("jwt"))
  async getECGSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param("sessionId", new ParseUUIDPipe()) sessionId: string,
  ) {
    const patientId = this.requirePatientId(user);
    return this.measurementsService.getECGSessionById(sessionId, patientId);
  }

  // ── Doctor-facing routes ────────────────────────────────────────────
  // Doctors could previously list their patients but read none of their data,
  // which left the whole remote-monitoring premise unimplemented. Each of
  // these requires an ACCEPTED relationship and writes an audit record,
  // because a clinician reading someone's health record is exactly the event
  // an audit trail exists to capture.

  @Get("patients/:patientId/summary")
  @UseGuards(AuthGuard("jwt"))
  async getPatientSummaryAsDoctor(
    @CurrentUser() user: AuthenticatedUser,
    @Param("patientId", new ParseUUIDPipe()) patientId: string,
  ) {
    await this.authorizeDoctorRead(user, patientId, "PATIENT_SUMMARY_VIEWED");
    return this.measurementsService.getVitalsSummary(patientId);
  }

  @Get("patients/:patientId/measurements")
  @UseGuards(AuthGuard("jwt"))
  async getPatientMeasurementsAsDoctor(
    @CurrentUser() user: AuthenticatedUser,
    @Param("patientId", new ParseUUIDPipe()) patientId: string,
    @Query() query: MeasurementQueryDto,
  ) {
    await this.authorizeDoctorRead(user, patientId, "PATIENT_MEASUREMENTS_VIEWED");

    return this.measurementsService.getPatientMeasurements(patientId, {
      type: query.type,
      limit: query.limit,
      startDate: query.startDate ? new Date(query.startDate) : undefined,
      endDate: query.endDate ? new Date(query.endDate) : undefined,
    });
  }

  @Get("patients/:patientId/trends")
  @UseGuards(AuthGuard("jwt"))
  async getPatientTrendsAsDoctor(
    @CurrentUser() user: AuthenticatedUser,
    @Param("patientId", new ParseUUIDPipe()) patientId: string,
    @Query() query: TrendQueryDto,
  ) {
    await this.authorizeDoctorRead(user, patientId, "PATIENT_TRENDS_VIEWED");
    return this.measurementsService.getTrends(patientId, query.type, query.days ?? 30);
  }

  @Get("patients/:patientId/ecg-sessions")
  @UseGuards(AuthGuard("jwt"))
  async getPatientEcgSessionsAsDoctor(
    @CurrentUser() user: AuthenticatedUser,
    @Param("patientId", new ParseUUIDPipe()) patientId: string,
    @Query() query: EcgQueryDto,
  ) {
    await this.authorizeDoctorRead(user, patientId, "PATIENT_ECG_LIST_VIEWED");

    return this.measurementsService.getPatientECGSessions(patientId, {
      limit: query.limit,
      startDate: query.startDate ? new Date(query.startDate) : undefined,
      endDate: query.endDate ? new Date(query.endDate) : undefined,
    });
  }

  @Get("patients/:patientId/ecg-sessions/:sessionId")
  @UseGuards(AuthGuard("jwt"))
  async getPatientEcgSessionAsDoctor(
    @CurrentUser() user: AuthenticatedUser,
    @Param("patientId", new ParseUUIDPipe()) patientId: string,
    @Param("sessionId", new ParseUUIDPipe()) sessionId: string,
  ) {
    await this.authorizeDoctorRead(user, patientId, "PATIENT_ECG_VIEWED", { sessionId });
    return this.measurementsService.getECGSessionById(sessionId, patientId);
  }

  private async authorizeDoctorRead(
    user: AuthenticatedUser,
    patientId: string,
    action: string,
    extra?: Record<string, unknown>,
  ) {
    if (!user.doctor) {
      throw new ForbiddenException("This action requires a doctor account");
    }

    await this.doctorsService.assertAuthorizedDoctor(user.doctor.id, patientId);

    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        action,
        resource: `patient:${patientId}`,
        metadata: { doctorId: user.doctor.id, patientId, ...extra },
      },
    });
  }

  private requirePatientId(user: AuthenticatedUser): string {
    if (!user.patient) {
      throw new ForbiddenException("This action requires a patient account");
    }
    return user.patient.id;
  }
}
