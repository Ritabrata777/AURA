import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AppController } from "./app.controller";
import { AuthModule } from "./auth/auth.module";
import { DevicesModule } from "./devices/devices.module";
import { MeasurementsModule } from "./measurements/measurements.module";
import { DoctorsModule } from "./doctors/doctors.module";
import { PrescriptionsModule } from "./prescriptions/prescriptions.module";
import { VideoModule } from "./video/video.module";
import { MqttModule } from "./mqtt/mqtt.module";
import { WebsocketModule } from "./websocket/websocket.module";
import { PrismaModule } from "./prisma/prisma.module";
import { IndividualUsersModule } from "./individual-users/individual-users.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    WebsocketModule,
    MqttModule,
    DevicesModule,
    MeasurementsModule,
    DoctorsModule,
    PrescriptionsModule,
    VideoModule,
    IndividualUsersModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
