import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { AuthenticatedUser } from "./auth.service";

/**
 * Typed accessor for the user attached by the JWT guard.
 *
 * Controllers previously used `@Request() req: any` and reached into
 * `req.user.patient?.id`, which meant a wrong shape (see the old
 * `payload.token` bug) failed silently at runtime instead of at compile time.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest<{ user: AuthenticatedUser }>();
    return request.user;
  },
);
