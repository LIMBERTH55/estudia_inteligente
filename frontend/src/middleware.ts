import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Rutas que requieren sesión (la cookie es httpOnly; la verificación fuerte la hace la API)
const PROTECTED = ["/dashboard", "/subjects", "/exams", "/tutor", "/stats", "/profile"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasToken = request.cookies.has("ep_token");

  if (PROTECTED.some((p) => pathname === p || pathname.startsWith(p + "/")) && !hasToken) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if ((pathname === "/login" || pathname === "/register") && hasToken) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/subjects/:path*", "/exams/:path*", "/tutor/:path*", "/stats/:path*", "/profile/:path*", "/login", "/register", "/dashboard"],
};
