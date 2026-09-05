import { Module } from "@nestjs/common";
import { PrescriptionsController } from "./prescriptions.controller";
import { PrescriptionsService } from "./prescriptions.service";
import { AuthModule } from "../auth/auth.module";
import { DoctorsModule } from "../doctors/doctors.module";

@Module({
  imports: [AuthModule, DoctorsModule],
  controllers: [PrescriptionsController],
  providers: [PrescriptionsService],
  exports: [PrescriptionsService],
})
export class PrescriptionsModule {}
