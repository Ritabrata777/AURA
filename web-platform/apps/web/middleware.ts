import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * HTML documents must never be served from browser cache: a stale page
 * referencing a previous build's class names renders as a broken hybrid of
 * two UIs. Static assets keep their content-hashed caching; this only marks
 * the documents themselves as always-revalidate.
 */
function noStore(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "no-store, must-revalidate");
  return response;
}

export function middleware(request: NextRequest) {
  const token = request.cookies.get("auth_token")?.value;
  const role = request.cookies.get("user_role")?.value;
  const pathname = request.nextUrl.pathname;

  // Public routes
  if (pathname === "/" || pathname.startsWith("/_next") || pathname.startsWith("/api")) {
    return noStore(NextResponse.next());
  }

  // Redirect to home if no auth
  if (!token) {
    return noStore(NextResponse.redirect(new URL("/", request.url)));
  }

  // Role-based route protection
  if (pathname.startsWith("/clinic/doctor") && role !== "DOCTOR") {
    return noStore(NextResponse.redirect(new URL("/", request.url)));
  }

  if (pathname.startsWith("/clinic/patient") && role !== "PATIENT") {
    return noStore(NextResponse.redirect(new URL("/", request.url)));
  }

  if (pathname.startsWith("/user") && role !== "INDIVIDUAL_USER") {
    return noStore(NextResponse.redirect(new URL("/", request.url)));
  }

  return noStore(NextResponse.next());
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
