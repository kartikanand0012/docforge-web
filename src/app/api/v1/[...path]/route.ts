import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import {
  FORWARDED_HEADERS,
  MAX_BODY_BYTES,
  SESSION_COOKIE,
  WORKSPACE_COOKIE,
  apiBase,
  declaredTooLarge,
  forwardedFor,
  isWorkspaceId,
  sameOrigin,
} from "@/lib/server";

/** The review screen's only way to the API: same origin, with the session token added here,
 * so the browser holds nothing but an HttpOnly cookie. */
async function forward(request: NextRequest, ctx: RouteContext<"/api/v1/[...path]">) {
  if (!sameOrigin(request)) return NextResponse.json({ detail: "Cross-site request refused." }, { status: 403 });
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return NextResponse.json({ detail: "Sign in first." }, { status: 401 });
  // Looking at someone else's workspace is reading only: nothing is sent on their behalf, and
  // nothing goes to the administrator's own workspace by mistake either.
  const viewing = jar.get(WORKSPACE_COOKIE)?.value;
  const reading = request.method === "GET" || request.method === "HEAD";
  if (isWorkspaceId(viewing) && !reading) {
    return NextResponse.json({ detail: "You are viewing someone's workspace, read only. Leave it to make changes." }, { status: 403 });
  }
  const { path } = await ctx.params;
  if (path.some((part) => part === ".." || part === "." || part.includes("/"))) {
    return NextResponse.json({ detail: "Bad path." }, { status: 400 });
  }
  const target = `${apiBase()}/v1/${path.map(encodeURIComponent).join("/")}${request.nextUrl.search}`;
  if (declaredTooLarge(request)) return NextResponse.json({ detail: "The file is too large." }, { status: 413 });
  const headers = new Headers({ Authorization: `Bearer ${token}`, ...forwardedFor(request) });
  if (isWorkspaceId(viewing)) headers.set("X-DocForge-Workspace", viewing);
  const type = request.headers.get("content-type");
  if (type) headers.set("Content-Type", type);
  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const body = hasBody ? await request.arrayBuffer() : undefined;
  // An undeclared length is checked once read; the front proxy caps it before that.
  if (body && body.byteLength > MAX_BODY_BYTES) {
    return NextResponse.json({ detail: "The file is too large." }, { status: 413 });
  }
  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      body,
      cache: "no-store",
      // A closed tab or a stopped answer ends the API's stream too.
      signal: request.signal,
    });
  } catch {
    return NextResponse.json({ detail: "DocForge's API did not answer. Try again shortly." }, { status: 502 });
  }
  const out = new Headers();
  for (const name of FORWARDED_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) out.set(name, value);
  }
  if (upstream.status === 401) jar.delete(SESSION_COOKIE);
  return new NextResponse(upstream.status === 204 ? null : upstream.body, { status: upstream.status, headers: out });
}

export const GET = forward;
export const POST = forward;
export const DELETE = forward;
export const PATCH = forward;
