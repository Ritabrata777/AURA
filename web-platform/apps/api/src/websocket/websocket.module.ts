import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DoctorsModule } from "../doctors/doctors.module";
import { LiveGateway } from "./websocket.gateway";

/**
 * LiveGateway used to be listed in both AppModule and DevicesModule, giving
 * two separate gateway instances. Only one of them ever received the
 * `@WebSocketServer()` injection, so emits from the other silently vanished.
 */
@Module({
  imports: [AuthModule, DoctorsModule],
  providers: [LiveGateway],
  exports: [LiveGateway],
})
export class WebsocketModule {}
