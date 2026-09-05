import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";
import { timingSafeEqual } from "node:crypto";

/**
 * Guards the device provisioning endpoint.
 *
 * Provisioning is the one route a device calls before any user is involved, so
 * it cannot use the JWT guard. It was previously left completely open, which
 * let anyone on the network create Device rows and mint pairing codes. A
 * factory-installed shared token is the minimum bar: the device sends it in
 * `x-provisioning-token`, and we compare in constant time.
 */
@Injectable()
export class ProvisioningTokenGuard implements CanActivate {
  private static warned = false;
  private readonly logger = new Logger(ProvisioningTokenGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const expected = process.env.DEVICE_PROVISIONING_TOKEN;

    if (!expected) {
      // main.ts refuses to boot without this in production, so reaching here
      // means a local dev environment. Allow it, but say so loudly once.
      if (!ProvisioningTokenGuard.warned) {
        ProvisioningTokenGuard.warned = true;
        this.logger.warn(
          "DEVICE_PROVISIONING_TOKEN is not set - device provisioning is unauthenticated",
        );
      }
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers["x-provisioning-token"];
    const provided = Array.isArray(header) ? header[0] : header;

    if (!provided || !ProvisioningTokenGuard.matches(provided, expected)) {
      throw new UnauthorizedException("Invalid provisioning token");
    }

    return true;
  }

  /** Constant-time compare that also tolerates a length mismatch. */
  private static matches(provided: string, expected: string): boolean {
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    if (a.length !== b.length) {
      // Still burn a comparison so the failure time does not leak the length.
      timingSafeEqual(b, b);
      return false;
    }
    return timingSafeEqual(a, b);
  }
}
