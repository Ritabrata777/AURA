import { Controller, Get } from "@nestjs/common";

@Controller("health")
export class AppController {
  @Get()
  getHealth() {
    return { 
      status: "ok", 
      service: "health-platform-api",
      timestamp: new Date().toISOString(),
    };
  }
}
