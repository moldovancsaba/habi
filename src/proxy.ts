import { NextResponse, type NextRequest } from "next/server";
import { canonicalHostRedirect } from "./lib/canonical-host.mjs";

export function proxy(request: NextRequest) {
  const redirectUrl = canonicalHostRedirect(
    request.nextUrl.hostname,
    request.nextUrl.pathname,
    request.nextUrl.search,
  );
  return redirectUrl
    ? NextResponse.redirect(redirectUrl, 308)
    : NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff2?)$).*)",
  ],
};
