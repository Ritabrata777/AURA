import { Controller, Get, Post, Body, Param, UseGuards, Request, Query } from "@nestjs/common";
import { VideoService } from "./video.service";
import { AuthGuard } from "@nestjs/passport";

class CreateConsultationDto {
  patientId: string;
  startsAt: string;
  durationMinutes: number;
}

@Controller("video")
export class VideoController {
  constructor(private readonly videoService: VideoService) {}

  @Post("consultations")
  @UseGuards(AuthGuard("jwt"))
  async createConsultation(@Request() req: any, @Body() body: CreateConsultationDto) {
    const doctorId = req.user.doctor?.id;
    
    if (!doctorId) {
      throw new Error("Only doctors can create consultations");
    }

    const startsAt = new Date(body.startsAt);
    const endsAt = new Date(startsAt.getTime() + body.durationMinutes * 60000);

    return this.videoService.createConsultationCall(doctorId, body.patientId, startsAt, endsAt);
  }

  @Get("consultations/active")
  @UseGuards(AuthGuard("jwt"))
  async getActiveConsultation(@Request() req: any) {
    const patientId = req.user.patient?.id;
    
    if (patientId) {
      return this.videoService.getActiveConsultation(patientId);
    }

    const doctorId = req.user.doctor?.id;
    if (doctorId) {
      return this.videoService.getDoctorActiveConsultation(doctorId);
    }

    return null;
  }

  @Get("consultations/:callId/token")
  @UseGuards(AuthGuard("jwt"))
  async getConsultationToken(@Request() req: any, @Param("callId") callId: string) {
    const userId = req.user.id;
    const role = req.user.patient ? "patient" : "doctor";

    return this.videoService.getConsultationToken(userId, callId, role as "patient" | "doctor");
  }
}
