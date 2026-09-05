import { Controller, Get, Post, Body, Param, UseGuards, ForbiddenException, ParseUUIDPipe } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { IsInt, IsISO8601, IsUUID, Max, Min } from "class-validator";
import { VideoService } from "./video.service";
import { AuthenticatedUser } from "../auth/auth.service";
import { CurrentUser } from "../auth/current-user.decorator";

// Undecorated DTOs are stripped and rejected by the global whitelist pipe, so
// these decorators are what make the endpoint reachable at all.
class CreateConsultationDto {
  @IsUUID()
  patientId!: string;

  @IsISO8601()
  startsAt!: string;

  @IsInt()
  @Min(5)
  @Max(240)
  durationMinutes!: number;
}

@Controller("video")
export class VideoController {
  constructor(private readonly videoService: VideoService) {}

  @Post("consultations")
  @UseGuards(AuthGuard("jwt"))
  async createConsultation(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateConsultationDto,
  ) {
    if (!user.doctor) {
      throw new ForbiddenException("Only doctors can create consultations");
    }

    const startsAt = new Date(body.startsAt);
    const endsAt = new Date(startsAt.getTime() + body.durationMinutes * 60000);

    return this.videoService.createConsultationCall(
      user.doctor.id,
      body.patientId,
      startsAt,
      endsAt,
    );
  }

  @Get("consultations/active")
  @UseGuards(AuthGuard("jwt"))
  async getActiveConsultation(@CurrentUser() user: AuthenticatedUser) {
    if (user.patient) {
      return this.videoService.getActiveConsultation(user.patient.id);
    }

    if (user.doctor) {
      return this.videoService.getDoctorActiveConsultation(user.doctor.id);
    }

    return null;
  }

  @Get("consultations/:callId/token")
  @UseGuards(AuthGuard("jwt"))
  async getConsultationToken(
    @CurrentUser() user: AuthenticatedUser,
    @Param("callId", new ParseUUIDPipe()) callId: string,
  ) {
    const role: "patient" | "doctor" = user.patient ? "patient" : "doctor";

    if (!user.patient && !user.doctor) {
      throw new ForbiddenException("Account has neither a doctor nor a patient profile");
    }

    // A call token is a key to a live video room containing another person's
    // consultation. It must only be issued to a participant of that call.
    return this.videoService.getConsultationToken(user.id, callId, role);
  }
}

