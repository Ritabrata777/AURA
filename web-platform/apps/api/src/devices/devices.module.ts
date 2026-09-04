import { Module } from "@nestjs/common";
import { DevicesController } from "./devices.controller";
import { DevicesService } from "./devices.service";
import { PrismaService } from "../prisma/prisma.service";
import { MqttIngestionService } from "../mqtt/mqtt.ingestion.service";
import { LiveGateway } from "../websocket/websocket.gateway";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [AuthModule],
  controllers: [DevicesController],
  providers: [DevicesService, PrismaService, MqttIngestionService, LiveGateway],
  exports: [DevicesService],
})
export class DevicesModule {}
