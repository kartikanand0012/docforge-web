import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, WORKSPACE_COOKIE, WORKSPACE_NAME_COOKIE, apiBase, cookieOptions, forwardedFor, sameOrigin } from "@/lib/server";

/** Create an account: the API answers with a session, which goes into the HttpOnly cookie as
 * on sign-in; the page never sees it. */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ detail: "Cross-site request refused." }, { status: 403 });
  const body = await request.text();
  let response: Response;
  try {
    response = await fetch(`${apiBase()}/v1/accounts`, {
      method: "POST",
      // The client address counts against the limit on new accounts from one place.
      headers: { "Content-Type": "application/json", ...forwardedFor(request) },
      body,
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ detail: "Creating an account is unavailable at the moment." }, { status: 503 });
  }
  const payload = (await response.json().catch(() => ({}))) as { token?: string; detail?: unknown };
  if (!response.ok || !payload.token) {
    const retry = response.headers.get("retry-after");
    // A validation error's detail is a list; only a sentence is passed on.
    const detail = typeof payload.detail === "string" ? payload.detail : null;
    return NextResponse.json({ detail }, { status: response.status, headers: retry ? { "Retry-After": retry } : undefined });
  }
  const jar = await cookies();
  jar.set(SESSION_COOKIE, payload.token, cookieOptions(request));
  jar.delete(WORKSPACE_COOKIE);
  jar.delete(WORKSPACE_NAME_COOKIE);
  return NextResponse.json({ signedUp: true }, { status: 201 });
}
