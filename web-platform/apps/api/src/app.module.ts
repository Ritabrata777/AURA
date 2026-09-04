import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { AuthModule } from "./auth/auth.module";
import { DevicesModule } from "./devices/devices.module";
import { MeasurementsModule } from "./measurements/measurements.module";
import { DoctorsModule } from "./doctors/doctors.module";
import { VideoModule } from "./video/video.module";
import { MqttIngestionService } from "./mqtt/mqtt.ingestion.service";
import { LiveGateway } from "./websocket/websocket.gateway";
import { PrismaService } from "./prisma/prisma.service";

@Module({
  imports: [
    AuthModule,
    DevicesModule,
    MeasurementsModule,
    DoctorsModule,
    VideoModule,
  ],
  controllers: [AppController],
  providers: [
    PrismaService,
    MqttIngestionService,
    LiveGateway,
  ],
})
export class AppModule {}
