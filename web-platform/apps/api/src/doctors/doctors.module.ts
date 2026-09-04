import { Module } from "@nestjs/common";
import { DoctorsController } from "./doctors.controller";
import { DoctorsService } from "./doctors.service";
import { PrismaService } from "../prisma/prisma.service";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [AuthModule],
  controllers: [DoctorsController],
  providers: [DoctorsService, PrismaService],
  exports: [DoctorsService],
})
export class DoctorsModule {}
