import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  Delete,
  HttpCode,
  HttpStatus,
  Query,
  ForbiddenException,
  ParseUUIDPipe,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { IsEmail, IsIn, IsOptional, IsString } from "class-validator";
import { DoctorsService } from "./doctors.service";
import { AuthenticatedUser } from "../auth/auth.service";
import { CurrentUser } from "../auth/current-user.decorator";

const RELATIONSHIP_STATES = ["PENDING", "ACCEPTED", "REJECTED", "REVOKED"] as const;

class RespondToRequestBody {
  @IsString()
  @IsIn(["ACCEPT", "REJECT"])
  action!: "ACCEPT" | "REJECT";
}

class RelationshipQuery {
  @IsOptional()
  @IsIn(RELATIONSHIP_STATES as unknown as string[])
  state?: string;
}

class RequestByEmailBody {
  @IsEmail()
  email!: string;
}

@Controller("doctors")
export class DoctorsController {
  constructor(private readonly doctorsService: DoctorsService) {}

  @Get("patients")
  @UseGuards(AuthGuard("jwt"))
  async getMyPatients(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: RelationshipQuery,
  ) {
    const doctorId = this.requireDoctorId(user);
    return this.doctorsService.getDoctorPatients(doctorId, query.state);
  }

  @Get("patients/pending")
  @UseGuards(AuthGuard("jwt"))
  async getPendingRequests(@CurrentUser() user: AuthenticatedUser) {
    const doctorId = this.requireDoctorId(user);
    return this.doctorsService.getPendingRequestsForDoctor(doctorId);
  }

  /**
   * Requesting access by email instead of by UUID.
   *
   * The UUID route below is the only way a doctor could start a relationship,
   * but nothing in the product ever shows a patient their own id — so in
   * practice a clinician had no way to fill it in. Email is the identifier
   * people actually exchange.
   */
  @Post("patients/request-by-email")
  @UseGuards(AuthGuard("jwt"))
  @HttpCode(HttpStatus.CREATED)
  async requestRelationshipByEmail(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: RequestByEmailBody,
  ) {
    const doctorId = this.requireDoctorId(user);
    return this.doctorsService.requestRelationshipByPatientEmail(doctorId, body.email);
  }

  @Post("patients/:patientId/request")
  @UseGuards(AuthGuard("jwt"))
  @HttpCode(HttpStatus.CREATED)
  async requestRelationship(
    @CurrentUser() user: AuthenticatedUser,
    @Param("patientId", new ParseUUIDPipe()) patientId: string,
  ) {
    const doctorId = this.requireDoctorId(user);
    return this.doctorsService.requestDoctorPatientRelationship(doctorId, patientId);
  }

  /**
   * The patient — not the doctor — approves access to their own health record.
   *
   * Previously this route derived the actor from `req.user.doctor.id`, so the
   * requesting doctor could accept their own request and grant themselves
   * access to a stranger's vitals. Consent now flows the correct direction:
   * the authenticated patient responds to a request naming a doctor.
   */
  @Post("requests/:doctorId/respond")
  @UseGuards(AuthGuard("jwt"))
  @HttpCode(HttpStatus.OK)
  async respondToRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param("doctorId", new ParseUUIDPipe()) doctorId: string,
    @Body() body: RespondToRequestBody,
  ) {
    const patientId = this.requirePatientId(user);
    return this.doctorsService.respondToRequest(doctorId, patientId, body.action);
  }

  /** Requests awaiting the authenticated patient's decision. */
  @Get("my-requests/pending")
  @UseGuards(AuthGuard("jwt"))
  async getMyPendingRequests(@CurrentUser() user: AuthenticatedUser) {
    const patientId = this.requirePatientId(user);
    return this.doctorsService.getPendingRequestsForPatient(patientId);
  }

  /**
   * Either side may end the relationship: a doctor drops a patient, or a
   * patient revokes a doctor's access. Access is marked REVOKED rather than
   * deleted so the consent history survives for auditing.
   */
  @Delete("relationships/:counterpartId")
  @UseGuards(AuthGuard("jwt"))
  @HttpCode(HttpStatus.OK)
  async revokeRelationship(
    @CurrentUser() user: AuthenticatedUser,
    @Param("counterpartId", new ParseUUIDPipe()) counterpartId: string,
  ) {
    if (user.doctor) {
      return this.doctorsService.revokeRelationship(user.doctor.id, counterpartId, "DOCTOR");
    }
    if (user.patient) {
      return this.doctorsService.revokeRelationship(counterpartId, user.patient.id, "PATIENT");
    }
    throw new ForbiddenException("Account has neither a doctor nor a patient profile");
  }

  @Get("my-doctors")
  @UseGuards(AuthGuard("jwt"))
  async getMyDoctors(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: RelationshipQuery,
  ) {
    const patientId = this.requirePatientId(user);
    return this.doctorsService.getPatientDoctors(patientId, query.state);
  }

  private requireDoctorId(user: AuthenticatedUser): string {
    if (!user.doctor) {
      throw new ForbiddenException("This action requires a doctor account");
    }
    return user.doctor.id;
  }

  private requirePatientId(user: AuthenticatedUser): string {
    if (!user.patient) {
      throw new ForbiddenException("This action requires a patient account");
    }
    return user.patient.id;
  }
}
