import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { Strategy, ExtractJwt } from "passport-jwt";
import { ConfigService } from "@nestjs/config";
import { AuthService, JwtPayload } from "../auth.service";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>("JWT_SECRET") || "default-secret-change-in-production",
    });
  }

  /**
   * Passport has already verified the signature and expiry, so `payload` is the
   * decoded claim set — `{ sub, email, role }`. The previous implementation read
   * `payload.token` (which never exists) and re-verified it, so every guarded
   * request resolved to null and returned 401.
   */
  async validate(payload: JwtPayload) {
    if (!payload?.sub) {
      throw new UnauthorizedException("Malformed token");
    }

    const user = await this.authService.getAuthenticatedUser(payload.sub);

    if (!user) {
      // The account was deleted after the token was issued.
      throw new UnauthorizedException("User no longer exists");
    }

    return user;
  }
}
