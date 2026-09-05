import { Module } from "@nestjs/common";
import { DevicesController } from "./devices.controller";
import { DevicesService } from "./devices.service";
import { MqttModule } from "../mqtt/mqtt.module";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [AuthModule, MqttModule],
  controllers: [DevicesController],
  providers: [DevicesService],
  exports: [DevicesService],
})
export class DevicesModule {}
