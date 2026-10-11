import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  API_TIMEOUT_MS,
  SESSION_COOKIE,
  WORKSPACE_COOKIE,
  WORKSPACE_NAME_COOKIE,
  apiBase,
  cookieOptions,
  detailFrom,
  forwardedFor,
  readSmallBody,
  sameOrigin,
  tokenFrom,
} from "@/lib/server";

/** Sign in: the token goes into an HttpOnly cookie; the page never sees it. */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ detail: "Cross-site request refused." }, { status: 403 });
  const body = await readSmallBody(request).catch(() => null);
  if (body === null) return NextResponse.json({ detail: "That request is too large." }, { status: 413 });
  let response: Response;
  try {
    response = await fetch(`${apiBase()}/v1/sessions`, {
      method: "POST",
      // The client address is passed on only where the front proxy is trusted to have set it.
      headers: { "Content-Type": "application/json", ...forwardedFor(request) },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
  } catch {
    return NextResponse.json({ detail: "Signing in is unavailable at the moment. Try again shortly." }, { status: 503 });
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const retry = response.headers.get("retry-after");
    // A validation error's detail is a list; only a sentence is passed on.
    const detail = detailFrom(payload, "Sign-in failed.");
    return NextResponse.json({ detail }, { status: response.status, headers: retry ? { "Retry-After": retry } : undefined });
  }
  const token = tokenFrom(payload);
  // An answer that says yes but carries no token is the API misbehaving, not a sign-in.
  if (!token) return NextResponse.json({ detail: "Signing in is unavailable at the moment. Try again shortly." }, { status: 502 });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, cookieOptions(request));
  // A new session starts in its own workspace, whatever the last person on this browser viewed.
  jar.delete(WORKSPACE_COOKIE);
  jar.delete(WORKSPACE_NAME_COOKIE);
  return NextResponse.json({ signedIn: true }, { status: 201 });
}

/** Sign out: forget the cookie, then end the session at the API. */
export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ detail: "Cross-site request refused." }, { status: 403 });
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  // The cookies go first, so the person is signed out here even if the API never answers.
  jar.delete(SESSION_COOKIE);
  jar.delete(WORKSPACE_COOKIE);
  jar.delete(WORKSPACE_NAME_COOKIE);
  if (token) {
    await fetch(`${apiBase()}/v1/sessions/current`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    }).catch(() => undefined);
  }
  // Page images are cached by the browser; on a shared computer they go with the session.
  return new NextResponse(null, { status: 204, headers: { "Clear-Site-Data": '"cache"' } });
}
