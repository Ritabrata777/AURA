import { Module } from "@nestjs/common";
import { MeasurementsController } from "./measurements.controller";
import { MeasurementsService } from "./measurements.service";
import { AuthModule } from "../auth/auth.module";
import { DoctorsModule } from "../doctors/doctors.module";

@Module({
  imports: [AuthModule, DoctorsModule],
  controllers: [MeasurementsController],
  providers: [MeasurementsService],
  exports: [MeasurementsService],
})
export class MeasurementsModule {}
