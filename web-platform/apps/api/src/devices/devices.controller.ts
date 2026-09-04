import { Controller, Get, Post, Body, Param, Delete, UseGuards, Request, HttpCode, HttpStatus } from "@nestjs/common";
import { DevicesService, ProvisionDeviceDto, PairDeviceDto } from "./devices.service";
import { AuthGuard } from "@nestjs/passport";

class ProvisionDeviceBody {
  hardwareId: string;
  pairingCode: string;
  credential: string;
}

class PairDeviceBody {
  pairingCode: string;
}

@Controller("devices")
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @Post("provision")
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
  async pair(@Request() req: any, @Body() body: PairDeviceBody) {
    const patientId = req.user.patient?.id;
    
    if (!patientId) {
      throw new Error("User is not a patient");
    }

    return this.devicesService.pairDevice({
      pairingCode: body.pairingCode,
      patientId,
    });
  }

  @Get()
  @UseGuards(AuthGuard("jwt"))
  async getMyDevices(@Request() req: any) {
    const patientId = req.user.patient?.id;
    
    if (!patientId) {
      return [];
    }

    return this.devicesService.getPatientDevices(patientId);
  }

  @Get(":deviceId")
  @UseGuards(AuthGuard("jwt"))
  async getDeviceStatus(@Param("deviceId") deviceId: string) {
    return this.devicesService.getDeviceStatus(deviceId);
  }

  @Delete(":deviceId")
  @UseGuards(AuthGuard("jwt"))
  @HttpCode(HttpStatus.OK)
  async unpair(@Request() req: any, @Param("deviceId") deviceId: string) {
    const patientId = req.user.patient?.id;
    
    if (!patientId) {
      throw new Error("User is not a patient");
    }

    return this.devicesService.unpairDevice(patientId, deviceId);
  }
}
