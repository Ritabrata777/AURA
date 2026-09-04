import { Module } from "@nestjs/common";
import { MeasurementsController } from "./measurements.controller";
import { MeasurementsService } from "./measurements.service";
import { PrismaService } from "../prisma/prisma.service";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [AuthModule],
  controllers: [MeasurementsController],
  providers: [MeasurementsService, PrismaService],
  exports: [MeasurementsService],
})
export class MeasurementsModule {}
