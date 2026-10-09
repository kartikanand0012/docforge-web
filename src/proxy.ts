import { NextResponse, type NextRequest } from "next/server";
import { needsSignIn } from "@/lib/nav";
import { SESSION_COOKIE } from "@/lib/server";

/** An optimistic check only: a page asked for without the session cookie goes to sign-in,
 * keeping where the person was going. Every API call is still checked by the API. */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (!needsSignIn(pathname, request.cookies.has(SESSION_COOKIE))) return NextResponse.next();
  const login = new URL("/login", request.url);
  if (pathname !== "/") login.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
