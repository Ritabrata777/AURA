import { Module } from "@nestjs/common";
import { IndividualUsersController } from "./individual-users.controller";
import { IndividualUsersService } from "./individual-users.service";
import { MqttModule } from "../mqtt/mqtt.module";

@Module({
  imports: [MqttModule],
  controllers: [IndividualUsersController],
  providers: [IndividualUsersService],
  exports: [IndividualUsersService],
})
export class IndividualUsersModule {}
