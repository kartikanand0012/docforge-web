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

/** Create an account: the API answers with a session, which goes into the HttpOnly cookie as
 * on sign-in; the page never sees it. */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ detail: "Cross-site request refused." }, { status: 403 });
  const body = await readSmallBody(request).catch(() => null);
  if (body === null) return NextResponse.json({ detail: "That request is too large." }, { status: 413 });
  let response: Response;
  try {
    response = await fetch(`${apiBase()}/v1/accounts`, {
      method: "POST",
      // The client address counts against the limit on new accounts from one place.
      headers: { "Content-Type": "application/json", ...forwardedFor(request) },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
  } catch {
    return NextResponse.json({ detail: "Creating an account is unavailable at the moment." }, { status: 503 });
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const retry = response.headers.get("retry-after");
    // A validation error's detail is a list; only a sentence is passed on (the page has its own).
    return NextResponse.json({ detail: detailFrom(payload, null) }, { status: response.status, headers: retry ? { "Retry-After": retry } : undefined });
  }
  const token = tokenFrom(payload);
  // An answer that says yes but carries no token is the API misbehaving, not a new account.
  if (!token) return NextResponse.json({ detail: null }, { status: 502 });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, cookieOptions(request));
  jar.delete(WORKSPACE_COOKIE);
  jar.delete(WORKSPACE_NAME_COOKIE);
  return NextResponse.json({ signedUp: true }, { status: 201 });
}
