import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { VideoController } from "./video.controller";
import { VideoService } from "./video.service";
import { AuthModule } from "../auth/auth.module";
import { DoctorsModule } from "../doctors/doctors.module";
import { PrismaService } from "../prisma/prisma.service";

@Module({
  imports: [ConfigModule, AuthModule, DoctorsModule],
  controllers: [VideoController],
  providers: [VideoService, PrismaService],
  exports: [VideoService],
})
export class VideoModule {}
