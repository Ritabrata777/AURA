import { NestFactory } from "@nestjs/core";
import { Logger, ValidationPipe } from "@nestjs/common";
import { AppModule } from "./app.module";
import { allowedOrigins } from "./config/cors";

async function bootstrap() {
  const logger = new Logger("Bootstrap");

  // Check the environment before creating the app. Constructing it first would
  // open the Prisma pool and the MQTT connection, then throw and leak both.
  //
  // A default JWT secret in production would let anyone mint a valid token for
  // any account, so refuse to start rather than run silently insecure.
  if (process.env.NODE_ENV === "production" && !process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET must be set in production");
  }

  // Without this, device provisioning is an open endpoint that lets anyone
  // create devices and mint pairing codes.
  if (process.env.NODE_ENV === "production" && !process.env.DEVICE_PROVISIONING_TOKEN) {
    throw new Error("DEVICE_PROVISIONING_TOKEN must be set in production");
  }

  const app = await NestFactory.create(AppModule);

  // Support several origins (web app, doctor portal) rather than a single one.
  const origins = allowedOrigins();

  app.enableCors({
    origin: origins,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  app.setGlobalPrefix("api", {
    // The health check stays at the root so container probes do not need to
    // know the prefix.
    exclude: ["health"],
  });

  // Ensures OnModuleDestroy runs (Prisma disconnect, MQTT client close) when
  // the container receives SIGTERM instead of leaking connections on shutdown.
  app.enableShutdownHooks();

  const port = process.env.PORT || 3001;
  await app.listen(port);

  logger.log(`API server running on port ${port}`);
  logger.log(`Accepting requests from: ${origins.join(", ")}`);
}

void bootstrap();
