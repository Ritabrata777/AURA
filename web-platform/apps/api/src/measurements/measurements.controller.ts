import { Controller, Get, Param, Query, UseGuards, Request } from "@nestjs/common";
import { MeasurementsService } from "./measurements.service";
import { AuthGuard } from "@nestjs/passport";

@Controller("measurements")
export class MeasurementsController {
  constructor(private readonly measurementsService: MeasurementsService) {}

  @Get()
  @UseGuards(AuthGuard("jwt"))
  async getMyMeasurements(@Request() req: any, @Query() query: any) {
    const patientId = req.user.patient?.id;
    
    if (!patientId) {
      return [];
    }

    const type = query.type as string | undefined;
    const limit = query.limit ? parseInt(query.limit, 10) : undefined;
    const startDate = query.startDate ? new Date(query.startDate) : undefined;
    const endDate = query.endDate ? new Date(query.endDate) : undefined;

    return this.measurementsService.getPatientMeasurements(patientId, {
      type,
      limit,
      startDate,
      endDate,
    });
  }

  @Get("latest")
  @UseGuards(AuthGuard("jwt"))
  async getLatestMeasurements(@Request() req: any) {
    const patientId = req.user.patient?.id;
    
    if (!patientId) {
      return { heartRate: null, spo2: null, temperature: null };
    }

    return this.measurementsService.getLatestMeasurements(patientId);
  }

  @Get("ecg-sessions")
  @UseGuards(AuthGuard("jwt"))
  async getECGSessions(@Request() req: any, @Query() query: any) {
    const patientId = req.user.patient?.id;
    
    if (!patientId) {
      return [];
    }

    const limit = query.limit ? parseInt(query.limit, 10) : undefined;
    const startDate = query.startDate ? new Date(query.startDate) : undefined;
    const endDate = query.endDate ? new Date(query.endDate) : undefined;

    return this.measurementsService.getPatientECGSessions(patientId, {
      limit,
      startDate,
      endDate,
    });
  }

  @Get("ecg-sessions/:sessionId")
  @UseGuards(AuthGuard("jwt"))
  async getECGSession(@Request() req: any, @Param("sessionId") sessionId: string) {
    const patientId = req.user.patient?.id;
    
    if (!patientId) {
      throw new Error("User is not a patient");
    }

    return this.measurementsService.getECGSessionById(sessionId, patientId);
  }
}
