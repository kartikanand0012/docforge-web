/** Server-side only: where the API is, and the session cookie that carries the token. */

export const SESSION_COOKIE = "df_session";
// A platform administrator looking at someone's workspace: its id, and its name for the
// banner. The API checks the administrator on every request; this only says which workspace.
export const WORKSPACE_COOKIE = "df_workspace";
export const WORKSPACE_NAME_COOKIE = "df_workspace_name";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isWorkspaceId(value: string | undefined | null): value is string {
  return typeof value === "string" && UUID.test(value);
}

export function apiBase(): string {
  return (process.env.DOCFORGE_API_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");
}

/** Secure whenever the browser reached us over HTTPS (directly or through a proxy that says
 * so); a Secure cookie over plain HTTP would be dropped, which only happens locally. */
export function cookieOptions(request: Request) {
  // Always Secure in production: behind a TLS terminator the request itself may look like
  // plain HTTP, and a missing header must not drop the flag.
  const https =
    process.env.NODE_ENV === "production" ||
    new URL(request.url).protocol === "https:" ||
    request.headers.get("x-forwarded-proto") === "https";
  return {
    httpOnly: true, // the token is never readable by page scripts
    sameSite: "strict" as const, // and never sent with a request started by another site
    secure: https,
    path: "/",
    maxAge: 8 * 60 * 60,
  };
}

/** A state-changing request must come from this site's own pages. */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (origin === null) return request.method === "GET" || request.method === "HEAD";
  // Compared with the Host the browser addressed: the server's own idea of its URL can differ
  // (for example localhost against 127.0.0.1). Behind a proxy, it must pass Host through.
  const host = request.headers.get("host");
  try {
    return host !== null && new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** The client address the front proxy (Caddy) set, passed on to the API so its sign-in limit
 * counts each visitor, not this server. Only where DOCFORGE_TRUST_PROXY=1, which a deployment
 * sets when the proxy is the only way in and overwrites the header; a browser that reaches
 * this server directly could put anything there. */
export function forwardedFor(
  request: Request,
  env: Record<string, string | undefined> = process.env,
): Record<string, string> {
  if (env.DOCFORGE_TRUST_PROXY !== "1") return {};
  // Only the address the edge itself saw: X-Real-IP where the edge sets it, else the last entry
  // of X-Forwarded-For (the one the edge appended). The entries before it are whatever the
  // browser sent, so passing them on would let anyone choose their address and slip past the
  // limits on sign-in and new accounts.
  const real = request.headers.get("x-real-ip")?.trim();
  const last = request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim();
  const address = real || last;
  return address && /^[0-9a-fA-F:.]{2,45}$/.test(address) ? { "X-Forwarded-For": address } : {};
}

/** Uploads are refused above the API's own limit before they are read into memory. */
export const MAX_BODY_BYTES = 11 * 1024 * 1024;

export function declaredTooLarge(request: Request, limit: number = MAX_BODY_BYTES): boolean {
  const declared = Number(request.headers.get("content-length") ?? "0");
  return Number.isFinite(declared) && declared > limit;
}

/** Headers of the API's answer passed back to the browser: its type and caching, when to try
 * again, a download's name, and whether an export was cut short. */
export const FORWARDED_HEADERS = ["content-type", "cache-control", "retry-after", "content-disposition", "x-docforge-truncated", "www-authenticate"];

/** A 401 that ends the session carries WWW-Authenticate (the API's "a valid session is
 * needed"); a wrong password re-entered to confirm something is a 401 without it, and the
 * session stays. */
export function sessionRefused(response: { status: number; headers: Headers }): boolean {
  return response.status === 401 && response.headers.has("www-authenticate");
}

/** How long a call to the API may take before the person is told it is unavailable, rather
 * than waiting until the platform gives up on the request. */
export const API_TIMEOUT_MS = 10_000;

/** A sign-in or sign-up body is a few hundred bytes. These routes are open to anyone, so a
 * larger one is refused before it is read into memory, and again once read if it lied. */
export const SMALL_BODY_BYTES = 16 * 1024;

export async function readSmallBody(request: Request, limit: number = SMALL_BODY_BYTES): Promise<string | null> {
  if (declaredTooLarge(request, limit)) return null;
  const capped = await readCapped(request, limit);
  return capped === null ? null : new TextDecoder().decode(capped);
}

/** The body, read at most `limit` bytes into memory: null as soon as it goes past the limit,
 * whatever Content-Length said (a chunked upload declares none). */
export async function readCapped(request: Request, limit: number): Promise<ArrayBuffer | null> {
  if (!request.body) return new ArrayBuffer(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const whole = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    whole.set(chunk, at);
    at += chunk.byteLength;
  }
  return whole.buffer;
}

/** The session token in the API's answer, if it is one; anything else is not trusted. Its
 * shape is the API's `dfs_<prefix>_<secret>`, which is also safe to put in a cookie as is. */
export function tokenFrom(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const token = (payload as { token?: unknown }).token;
  return typeof token === "string" && /^dfs_[0-9a-f]{12}_[A-Za-z0-9_-]{32,128}$/.test(token) ? token : null;
}

/** A sentence from the API's answer, or the fallback: a validation error's list is not shown. */
export function detailFrom<F extends string | null>(payload: unknown, fallback: F): string | F {
  const detail = typeof payload === "object" && payload !== null ? (payload as { detail?: unknown }).detail : null;
  return typeof detail === "string" && detail ? detail : fallback;
}

/** A cookie value decoded, or "" if it is not valid encoding (a cookie is the browser's to send). */
export function safeDecode(value: string | undefined): string {
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return "";
  }
}
