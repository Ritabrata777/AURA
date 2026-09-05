import { Module } from "@nestjs/common";
import { WebsocketModule } from "../websocket/websocket.module";
import { MqttIngestionService } from "./mqtt.ingestion.service";

@Module({
  imports: [WebsocketModule],
  providers: [MqttIngestionService],
  exports: [MqttIngestionService],
})
export class MqttModule {}
