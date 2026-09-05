import { Global, Module } from "@nestjs/common";
import { PrismaService } from "./prisma.service";

/**
 * PrismaService was listed in the `providers` array of every feature module,
 * and Nest scopes providers per module — so each module instantiated its own
 * PrismaClient, and each client opened its own connection pool. A global
 * module gives the whole app one shared client.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
