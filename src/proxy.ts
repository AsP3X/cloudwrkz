import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Public routes that don't require authentication
const PUBLIC_ROUTES = ["/", "/login", "/register", "/terms", "/privacy", "/about", "/contact", "/health"];

/**
 * Check if a path matches any of the public routes
 */
function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

/**
 * Check if a path is a protected route (requires auth)
 */
function isProtectedRoute(pathname: string): boolean {
  // All routes except public ones are protected
  return !isPublicRoute(pathname);
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public routes
  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  // Check for protected routes
  if (isProtectedRoute(pathname)) {
    // Get session token from cookies
    const sessionToken = request.cookies.get("session")?.value;

    if (!sessionToken) {
      // No session, redirect to login
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }

    // Note: Actual verification of user status (active/verified) happens in
    // server components/layouts using getCurrentUser() which checks the database.
    // Middleware only checks for session cookie existence for performance.
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
  ],
};
