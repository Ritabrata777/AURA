import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import { PrescriptionStatus } from "@prisma/client";
import { PrescriptionsService } from "./prescriptions.service";
import { DoctorsService } from "../doctors/doctors.service";
import { PrismaService } from "../prisma/prisma.service";
import { AuthenticatedUser } from "../auth/auth.service";
import { CurrentUser } from "../auth/current-user.decorator";

const PRESCRIPTION_STATUSES = ["ACTIVE", "COMPLETED", "CANCELLED"] as const;

class MedicationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  drug!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  dose!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  frequency!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  duration?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  route?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  instructions?: string;
}

class CreatePrescriptionDto {
  @IsUUID()
  patientId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  diagnosis!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  // A prescription with no drugs is not a prescription; the cap keeps a single
  // request from writing an unbounded number of rows.
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => MedicationDto)
  medications!: MedicationDto[];
}

class UpdateStatusDto {
  @IsIn(PRESCRIPTION_STATUSES as unknown as string[])
  status!: PrescriptionStatus;
}

class PrescriptionQueryDto {
  @IsOptional()
  @IsIn(PRESCRIPTION_STATUSES as unknown as string[])
  status?: PrescriptionStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

@Controller("prescriptions")
export class PrescriptionsController {
  constructor(
    private readonly prescriptionsService: PrescriptionsService,
    private readonly doctorsService: DoctorsService,
    private readonly prisma: PrismaService,
  ) {}

  // ── Patient-facing routes ───────────────────────────────────────────

  /** A patient's own prescriptions. No audit entry: reading your own record. */
  @Get()
  @UseGuards(AuthGuard("jwt"))
  async getMyPrescriptions(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PrescriptionQueryDto,
  ) {
    const patientId = this.requirePatientId(user);
    return this.prescriptionsService.getPatientPrescriptions(patientId, {
      status: query.status,
      limit: query.limit,
    });
  }

  @Get(":prescriptionId")
  @UseGuards(AuthGuard("jwt"))
  async getMyPrescription(
    @CurrentUser() user: AuthenticatedUser,
    @Param("prescriptionId", new ParseUUIDPipe()) prescriptionId: string,
  ) {
    const patientId = this.requirePatientId(user);
    return this.prescriptionsService.getPrescriptionById(prescriptionId, patientId);
  }

  // ── Doctor-facing routes ────────────────────────────────────────────

  @Post()
  @UseGuards(AuthGuard("jwt"))
  async createPrescription(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreatePrescriptionDto,
  ) {
    const doctorId = this.requireDoctorId(user);

    // Authorization lives in the service so it cannot be bypassed by another
    // caller; it throws before anything is written.
    return this.prescriptionsService.createPrescription(doctorId, user.id, {
      patientId: body.patientId,
      diagnosis: body.diagnosis,
      notes: body.notes,
      medications: body.medications,
    });
  }

  @Get("patients/:patientId")
  @UseGuards(AuthGuard("jwt"))
  async getPatientPrescriptionsAsDoctor(
    @CurrentUser() user: AuthenticatedUser,
    @Param("patientId", new ParseUUIDPipe()) patientId: string,
    @Query() query: PrescriptionQueryDto,
  ) {
    await this.authorizeDoctorRead(user, patientId, "PATIENT_PRESCRIPTIONS_VIEWED");

    return this.prescriptionsService.getPatientPrescriptions(patientId, {
      status: query.status,
      limit: query.limit,
    });
  }

  @Patch(":prescriptionId/status")
  @UseGuards(AuthGuard("jwt"))
  async updatePrescriptionStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param("prescriptionId", new ParseUUIDPipe()) prescriptionId: string,
    @Body() body: UpdateStatusDto,
  ) {
    const doctorId = this.requireDoctorId(user);
    return this.prescriptionsService.updateStatus(prescriptionId, doctorId, user.id, body.status);
  }

  private async authorizeDoctorRead(user: AuthenticatedUser, patientId: string, action: string) {
    if (!user.doctor) {
      throw new ForbiddenException("This action requires a doctor account");
    }

    await this.doctorsService.assertAuthorizedDoctor(user.doctor.id, patientId);

    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        action,
        resource: `patient:${patientId}`,
        metadata: { doctorId: user.doctor.id, patientId },
      },
    });
  }

  private requirePatientId(user: AuthenticatedUser): string {
    if (!user.patient) {
      throw new ForbiddenException("This action requires a patient account");
    }
    return user.patient.id;
  }

  private requireDoctorId(user: AuthenticatedUser): string {
    if (!user.doctor) {
      throw new ForbiddenException("This action requires a doctor account");
    }
    return user.doctor.id;
  }
}
