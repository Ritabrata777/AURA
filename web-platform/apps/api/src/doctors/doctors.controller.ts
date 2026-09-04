import { Controller, Get, Post, Param, Body, UseGuards, Request, Delete, HttpCode, HttpStatus, Query } from "@nestjs/common";
import { DoctorsService } from "./doctors.service";
import { AuthGuard } from "@nestjs/passport";

class RequestRelationshipDto {
  patientEmail!: string;
}

class RespondToRequestDto {
  action!: "ACCEPT" | "REJECT";
}

@Controller("doctors")
export class DoctorsController {
  constructor(private readonly doctorsService: DoctorsService) {}

  @Get("patients")
  @UseGuards(AuthGuard("jwt"))
  async getMyPatients(@Request() req: any, @Query("state") state?: string) {
    const doctorId = req.user.doctor?.id;
    
    if (!doctorId) {
      throw new Error("User is not a doctor");
    }

    return this.doctorsService.getDoctorPatients(doctorId, state);
  }

  @Get("patients/pending")
  @UseGuards(AuthGuard("jwt"))
  async getPendingRequests(@Request() req: any) {
    const doctorId = req.user.doctor?.id;
    
    if (!doctorId) {
      throw new Error("User is not a doctor");
    }

    return this.doctorsService.getPendingRequestsForDoctor(doctorId);
  }

  @Post("patients/:patientId/request")
  @UseGuards(AuthGuard("jwt"))
  @HttpCode(HttpStatus.CREATED)
  async requestRelationship(@Request() req: any, @Param("patientId") patientId: string) {
    const doctorId = req.user.doctor?.id;
    
    if (!doctorId) {
      throw new Error("User is not a doctor");
    }

    return this.doctorsService.requestDoctorPatientRelationship(doctorId, patientId);
  }

  @Post("patients/:patientId/respond")
  @UseGuards(AuthGuard("jwt"))
  @HttpCode(HttpStatus.OK)
  async respondToRequest(@Request() req: any, @Param("patientId") patientId: string, @Body() body: RespondToRequestDto) {
    const doctorId = req.user.doctor?.id;
    
    if (!doctorId) {
      throw new Error("User is not a doctor");
    }

    return this.doctorsService.respondToRequest(doctorId, patientId, body.action);
  }

  @Delete("patients/:patientId")
  @UseGuards(AuthGuard("jwt"))
  @HttpCode(HttpStatus.OK)
  async revokeRelationship(@Request() req: any, @Param("patientId") patientId: string) {
    const doctorId = req.user.doctor?.id;
    
    if (!doctorId) {
      throw new Error("User is not a doctor");
    }

    return this.doctorsService.revokeRelationship(doctorId, patientId);
  }

  @Get("my-doctors")
  @UseGuards(AuthGuard("jwt"))
  async getMyDoctors(@Request() req: any, @Query("state") state?: string) {
    const patientId = req.user.patient?.id;
    
    if (!patientId) {
      throw new Error("User is not a patient");
    }

    return this.doctorsService.getPatientDoctors(patientId, state);
  }
}
