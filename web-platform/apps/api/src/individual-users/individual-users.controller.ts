import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  ForbiddenException,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { IsIn, IsInt, IsISO8601, IsOptional, IsString, Length, Max, Min, IsNotEmpty } from "class-validator";
import { Type } from "class-transformer";
import { MeasurementType } from "@prisma/client";
import { DEVICE_COMMANDS, DeviceCommand, ECG_MAX_DURATION_SECONDS, ECG_MIN_DURATION_SECONDS } from "@health-platform/protocol";
import { IndividualUsersService } from "./individual-users.service";
import { AuthenticatedUser } from "../auth/auth.service";
import { CurrentUser } from "../auth/current-user.decorator";

const MEASUREMENT_TYPES = ["HEART_RATE", "SPO2", "TEMPERATURE"] as const;

class PairDeviceBody {
  @IsString()
  @IsNotEmpty()
  @Length(4, 32)
  pairingCode!: string;
}

class SendCommandBody {
  @IsIn(DEVICE_COMMANDS as unknown as string[])
  command!: DeviceCommand;

  @IsOptional()
  @IsInt()
  @Min(ECG_MIN_DURATION_SECONDS)
  @Max(ECG_MAX_DURATION_SECONDS)
  durationSeconds?: number;
}

class MeasurementQueryDto {
  @IsOptional()
  @IsIn(MEASUREMENT_TYPES as unknown as string[])
  type?: MeasurementType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;

  @IsOptional()
  @IsISO8601()
  startDate?: string;

  @IsOptional()
  @IsISO8601()
  endDate?: string;
}

class TrendQueryDto {
  @IsIn(MEASUREMENT_TYPES as unknown as string[])
  type!: MeasurementType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  days?: number;
}

@Controller("individual-users")
export class IndividualUsersController {
  constructor(private readonly service: IndividualUsersService) {}

  private requireId(user: AuthenticatedUser): string {
    if (!user.individualUser) {
      throw new ForbiddenException("This action requires an individual user account");
    }
    return user.individualUser.id;
  }

  // ── Devices ────────────────────────────────────────────────────────

  @Get("devices")
  @UseGuards(AuthGuard("jwt"))
  async getDevices(@CurrentUser() user: AuthenticatedUser) {
    return this.service.getDevices(this.requireId(user));
  }

  @Post("devices/pair")
  @UseGuards(AuthGuard("jwt"))
  @HttpCode(HttpStatus.OK)
  async pairDevice(@CurrentUser() user: AuthenticatedUser, @Body() body: PairDeviceBody) {
    return this.service.pairDevice(this.requireId(user), body.pairingCode);
  }

  @Delete("devices/:deviceId")
  @UseGuards(AuthGuard("jwt"))
  @HttpCode(HttpStatus.OK)
  async unpairDevice(
    @CurrentUser() user: AuthenticatedUser,
    @Param("deviceId", new ParseUUIDPipe()) deviceId: string,
  ) {
    return this.service.unpairDevice(this.requireId(user), deviceId);
  }

  @Post("devices/:deviceId/commands")
  @UseGuards(AuthGuard("jwt"))
  @HttpCode(HttpStatus.ACCEPTED)
  async sendCommand(
    @CurrentUser() user: AuthenticatedUser,
    @Param("deviceId", new ParseUUIDPipe()) deviceId: string,
    @Body() body: SendCommandBody,
  ) {
    return this.service.sendCommand(this.requireId(user), deviceId, body.command, body.durationSeconds);
  }

  // ── Measurements ───────────────────────────────────────────────────

  @Get("measurements")
  @UseGuards(AuthGuard("jwt"))
  async getMeasurements(@CurrentUser() user: AuthenticatedUser, @Query() query: MeasurementQueryDto) {
    return this.service.getMeasurements(this.requireId(user), {
      type: query.type,
      limit: query.limit,
      startDate: query.startDate ? new Date(query.startDate) : undefined,
      endDate: query.endDate ? new Date(query.endDate) : undefined,
    });
  }

  @Get("measurements/summary")
  @UseGuards(AuthGuard("jwt"))
  async getSummary(@CurrentUser() user: AuthenticatedUser) {
    return this.service.getSummary(this.requireId(user));
  }

  @Get("measurements/trends")
  @UseGuards(AuthGuard("jwt"))
  async getTrends(@CurrentUser() user: AuthenticatedUser, @Query() query: TrendQueryDto) {
    return this.service.getTrends(this.requireId(user), query.type, query.days ?? 30);
  }

  @Get("measurements/ecg-sessions")
  @UseGuards(AuthGuard("jwt"))
  async getEcgSessions(@CurrentUser() user: AuthenticatedUser) {
    return this.service.getEcgSessions(this.requireId(user));
  }

  @Get("measurements/ecg-sessions/:sessionId")
  @UseGuards(AuthGuard("jwt"))
  async getEcgSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param("sessionId", new ParseUUIDPipe()) sessionId: string,
  ) {
    return this.service.getEcgSessionById(sessionId, this.requireId(user));
  }
}
