import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { WORKSPACE_COOKIE, WORKSPACE_NAME_COOKIE, cookieOptions, isWorkspaceId, sameOrigin } from "@/lib/server";

/** A platform administrator starts looking at a workspace, read only. Whether they may is the
 * API's decision, on every request; an ordinary account that sets this gets a refusal. */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ detail: "Cross-site request refused." }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as { tenant_id?: unknown; name?: unknown };
  const id = typeof body.tenant_id === "string" ? body.tenant_id : null;
  if (!isWorkspaceId(id)) return NextResponse.json({ detail: "Not a workspace." }, { status: 400 });
  const name = typeof body.name === "string" ? body.name.slice(0, 120) : "";
  const jar = await cookies();
  jar.set(WORKSPACE_COOKIE, id, cookieOptions(request));
  jar.set(WORKSPACE_NAME_COOKIE, encodeURIComponent(name), cookieOptions(request));
  return new NextResponse(null, { status: 204 });
}

/** Back to the administrator's own workspace. */
export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ detail: "Cross-site request refused." }, { status: 403 });
  const jar = await cookies();
  jar.delete(WORKSPACE_COOKIE);
  jar.delete(WORKSPACE_NAME_COOKIE);
  return new NextResponse(null, { status: 204 });
}
