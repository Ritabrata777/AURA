import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  UseGuards,
  HttpCode,
  HttpStatus,
  ForbiddenException,
  ParseUUIDPipe,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from "class-validator";
import {
  DEVICE_COMMANDS,
  DeviceCommand,
  ECG_MAX_DURATION_SECONDS,
  ECG_MIN_DURATION_SECONDS,
} from "@health-platform/protocol";
import { DevicesService } from "./devices.service";
import { ProvisioningTokenGuard } from "./provisioning-token.guard";
import { AuthenticatedUser } from "../auth/auth.service";
import { CurrentUser } from "../auth/current-user.decorator";

// These DTOs previously had no class-validator decorators. Because main.ts
// enables `whitelist` + `forbidNonWhitelisted`, an undecorated DTO means every
// submitted property is treated as non-whitelisted and the request is rejected
// with 400 — so none of these endpoints were reachable.

class ProvisionDeviceBody {
  @IsString()
  @IsNotEmpty()
  @Length(4, 64)
  hardwareId!: string;

  @IsString()
  @IsNotEmpty()
  @Length(4, 32)
  pairingCode!: string;

  @IsString()
  @IsNotEmpty()
  @Length(8, 128)
  credential!: string;
}

class PairDeviceBody {
  @IsString()
  @IsNotEmpty()
  @Length(4, 32)
  pairingCode!: string;
}

class SendCommandBody {
  @IsIn(DEVICE_COMMANDS as unknown as string[])
  command!: DeviceCommand;

  /** Only meaningful for START_ECG; ignored for every other command. */
  @IsOptional()
  @IsInt()
  @Min(ECG_MIN_DURATION_SECONDS)
  @Max(ECG_MAX_DURATION_SECONDS)
  durationSeconds?: number;
}

@Controller("devices")
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @Post("provision")
  @UseGuards(ProvisioningTokenGuard)
  @HttpCode(HttpStatus.CREATED)
  async provision(@Body() body: ProvisionDeviceBody) {
    return this.devicesService.provisionDevice({
      hardwareId: body.hardwareId,
      pairingCode: body.pairingCode,
      credential: body.credential,
    });
  }

  @Post("pair")
  @UseGuards(AuthGuard("jwt"))
  @HttpCode(HttpStatus.OK)
  async pair(@CurrentUser() user: AuthenticatedUser, @Body() body: PairDeviceBody) {
    const patientId = this.requirePatientId(user);

    return this.devicesService.pairDevice({
      pairingCode: body.pairingCode,
      patientId,
    });
  }

  @Get()
  @UseGuards(AuthGuard("jwt"))
  async getMyDevices(@CurrentUser() user: AuthenticatedUser) {
    if (!user.patient) {
      return [];
    }

    return this.devicesService.getPatientDevices(user.patient.id);
  }

  @Get(":deviceId")
  @UseGuards(AuthGuard("jwt"))
  async getDeviceStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param("deviceId", new ParseUUIDPipe()) deviceId: string,
  ) {
    const patientId = this.requirePatientId(user);
    return this.devicesService.getDeviceStatus(deviceId, patientId);
  }

  /**
   * Sends a command (START_ECG, STOP_SPO2, GET_STATUS, ...) to a paired device.
   * The publish path already existed in the ingestion service but nothing
   * exposed it, so the platform could read from devices but never control them.
   */
  @Post(":deviceId/commands")
  @UseGuards(AuthGuard("jwt"))
  @HttpCode(HttpStatus.ACCEPTED)
  async sendCommand(
    @CurrentUser() user: AuthenticatedUser,
    @Param("deviceId", new ParseUUIDPipe()) deviceId: string,
    @Body() body: SendCommandBody,
  ) {
    const patientId = this.requirePatientId(user);

    return this.devicesService.sendCommand(patientId, deviceId, {
      command: body.command,
      durationSeconds: body.durationSeconds,
    });
  }

  @Delete(":deviceId")
  @UseGuards(AuthGuard("jwt"))
  @HttpCode(HttpStatus.OK)
  async unpair(
    @CurrentUser() user: AuthenticatedUser,
    @Param("deviceId", new ParseUUIDPipe()) deviceId: string,
  ) {
    const patientId = this.requirePatientId(user);
    return this.devicesService.unpairDevice(patientId, deviceId);
  }

  /**
   * Controllers used to `throw new Error("User is not a patient")`, which Nest
   * surfaces as a 500. A doctor hitting a patient route is a permission
   * problem, not a server fault.
   */
  private requirePatientId(user: AuthenticatedUser): string {
    if (!user.patient) {
      throw new ForbiddenException("This action requires a patient account");
    }
    return user.patient.id;
  }
}
