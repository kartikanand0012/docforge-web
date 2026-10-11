// @vitest-environment node
import { NextRequest } from "next/server";

type Init = ConstructorParameters<typeof NextRequest>[1];
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** The cookie jar `cookies()` hands a route handler, kept in a map the tests can look at. */
const jar = vi.hoisted(() => {
  const values = new Map<string, string>();
  return {
    values,
    get: (name: string) => (values.has(name) ? { name, value: values.get(name)! } : undefined),
    set: vi.fn((name: string, value: string) => void values.set(name, value)),
    delete: vi.fn((name: string) => void values.delete(name)),
  };
});
vi.mock("next/headers", () => ({ cookies: async () => jar }));

import * as session from "@/app/api/session/route";
import * as signup from "@/app/api/signup/route";
import * as proxy from "@/app/api/v1/[...path]/route";
import * as workspace from "@/app/api/workspace/route";
import { MAX_BODY_BYTES, SESSION_COOKIE, SMALL_BODY_BYTES, WORKSPACE_COOKIE, WORKSPACE_NAME_COOKIE } from "@/lib/server";

const TOKEN = `dfs_0123456789ab_${"A".repeat(43)}`;
const WORKSPACE = "2f1c9a3e-8b7d-4c6e-9a1b-0d2e3f4a5b6c";
const fetchSpy = vi.fn<typeof fetch>();

beforeEach(() => {
  jar.values.clear();
  jar.set.mockClear();
  jar.delete.mockClear();
  fetchSpy.mockReset();
  vi.stubGlobal("fetch", fetchSpy);
});
afterEach(() => vi.unstubAllGlobals());

const SITE = "http://localhost:3000";
const same = { origin: SITE, host: "localhost:3000" };

function post(path: string, body: BodyInit | null, headers: Record<string, string> = {}) {
  return new NextRequest(`${SITE}${path}`, { method: "POST", headers: { ...same, ...headers }, body, duplex: "half" } as Init);
}

function json(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

function endless(): ReadableStream<Uint8Array> {
  return new ReadableStream({
    pull(controller) {
      controller.enqueue(new Uint8Array(64 * 1024));
    },
  });
}

describe.each([
  { name: "sign-in", handler: () => session.POST, path: "/api/session", fallback: "Sign-in failed." },
  { name: "sign-up", handler: () => signup.POST, path: "/api/signup", fallback: null },
])("$name", ({ handler, path, fallback }) => {
  it("puts a valid token into the session cookie and leaves any viewed workspace", async () => {
    jar.values.set(WORKSPACE_COOKIE, WORKSPACE);
    fetchSpy.mockResolvedValue(json(201, { token: TOKEN }));
    const response = await handler()(post(path, '{"email":"a@b.in"}'));
    expect(response.status).toBe(201);
    expect(jar.values.get(SESSION_COOKIE)).toBe(TOKEN);
    expect(jar.values.has(WORKSPACE_COOKIE)).toBe(false);
    expect(fetchSpy.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("answers 502 when the API says yes without a token", async () => {
    fetchSpy.mockResolvedValue(json(201, { token: "not one" }));
    const response = await handler()(post(path, "{}"));
    expect(response.status).toBe(502);
    expect(jar.set).not.toHaveBeenCalled();
  });

  it("passes on a sentence, never a validation list, and when to try again", async () => {
    fetchSpy.mockResolvedValueOnce(json(422, { detail: [{ loc: ["body", "email"], msg: "bad" }] }));
    expect(await (await handler()(post(path, "{}"))).json()).toEqual({ detail: fallback });
    fetchSpy.mockResolvedValueOnce(json(429, { detail: "Too many." }, { "retry-after": "900" }));
    const limited = await handler()(post(path, "{}"));
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("900");
    expect(await limited.json()).toEqual({ detail: "Too many." });
  });

  it("refuses a large body, declared or not, without calling the API", async () => {
    const declared = await handler()(post(path, "{}", { "content-length": String(SMALL_BODY_BYTES + 1) }));
    expect(declared.status).toBe(413);
    const undeclared = await handler()(post(path, endless()));
    expect(undeclared.status).toBe(413);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refuses another site", async () => {
    const response = await handler()(post(path, "{}", { origin: "https://evil.example" }));
    expect(response.status).toBe(403);
  });

  it("says it is unavailable when the API does not answer in time", async () => {
    fetchSpy.mockRejectedValue(new DOMException("timed out", "TimeoutError"));
    expect((await handler()(post(path, "{}"))).status).toBe(503);
  });
});

describe("sign-out", () => {
  const signOut = () => new Request(`${SITE}/api/session`, { method: "DELETE", headers: same });

  it("forgets the cookies before the API is asked, so a hung API still signs the person out", async () => {
    jar.values.set(SESSION_COOKIE, TOKEN);
    jar.values.set(WORKSPACE_COOKIE, WORKSPACE);
    let cookiesAtCall: string[] = [];
    fetchSpy.mockImplementation(async () => {
      cookiesAtCall = [...jar.values.keys()];
      throw new Error("down");
    });
    const response = await session.DELETE(signOut());
    expect(cookiesAtCall).toEqual([]);
    expect(response.status).toBe(204);
    expect(fetchSpy.mock.calls[0][1]?.headers).toEqual({ Authorization: `Bearer ${TOKEN}` });
    expect(fetchSpy.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
  });
});

describe("viewing a workspace", () => {
  const start = (body: unknown) => post("/api/workspace", JSON.stringify(body));

  it("needs a session", async () => {
    expect((await workspace.POST(start({ tenant_id: WORKSPACE }))).status).toBe(401);
  });

  it("needs a workspace id", async () => {
    jar.values.set(SESSION_COOKIE, TOKEN);
    expect((await workspace.POST(start({ tenant_id: "../admin" }))).status).toBe(400);
    expect((await workspace.POST(post("/api/workspace", "not json"))).status).toBe(400);
  });

  it("sets the workspace and its name, cut by characters", async () => {
    jar.values.set(SESSION_COOKIE, TOKEN);
    const name = `${"a".repeat(119)}😀😀`;
    const response = await workspace.POST(start({ tenant_id: WORKSPACE, name }));
    expect(response.status).toBe(204);
    expect(jar.values.get(WORKSPACE_COOKIE)).toBe(WORKSPACE);
    expect(decodeURIComponent(jar.values.get(WORKSPACE_NAME_COOKIE)!)).toBe(`${"a".repeat(119)}😀`);
  });

  it("refuses a large body", async () => {
    jar.values.set(SESSION_COOKIE, TOKEN);
    expect((await workspace.POST(post("/api/workspace", endless()))).status).toBe(413);
  });
});

describe("the API proxy", () => {
  const ctx = (...path: string[]) => ({ params: Promise.resolve({ path }) });
  const call = (method: string, path: string[], init: { body?: BodyInit; headers?: Record<string, string> } = {}) =>
    proxy[method as "GET"](
      new NextRequest(`${SITE}/api/v1/${path.join("/")}`, { method, headers: { ...same, ...init.headers }, body: init.body, duplex: "half" } as Init),
      ctx(...path),
    );

  beforeEach(() => jar.values.set(SESSION_COOKIE, TOKEN));

  it("needs a session", async () => {
    jar.values.clear();
    expect((await call("GET", ["documents"])).status).toBe(401);
  });

  it("names the viewed workspace only on a read, and refuses every change while viewing", async () => {
    jar.values.set(WORKSPACE_COOKIE, WORKSPACE);
    fetchSpy.mockResolvedValue(json(200, []));
    await call("GET", ["documents"]);
    const sent = fetchSpy.mock.calls[0][1]?.headers as Headers;
    expect(sent.get("x-docforge-workspace")).toBe(WORKSPACE);
    expect(sent.get("authorization")).toBe(`Bearer ${TOKEN}`);
    for (const method of ["POST", "PATCH", "DELETE"]) {
      expect((await call(method, ["documents", "d1"], { body: method === "DELETE" ? undefined : "{}" })).status).toBe(403);
    }
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("adds no workspace header for a cookie that is not a workspace id", async () => {
    jar.values.set(WORKSPACE_COOKIE, "someone-else");
    fetchSpy.mockResolvedValue(json(200, []));
    await call("GET", ["documents"]);
    expect((fetchSpy.mock.calls[0][1]?.headers as Headers).has("x-docforge-workspace")).toBe(false);
  });

  it("refuses a path that climbs out of /v1", async () => {
    for (const path of [["..", "admin"], [".", "x"], ["a/b"]]) {
      expect((await call("GET", path)).status).toBe(400);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("forgets a session the API refuses", async () => {
    fetchSpy.mockResolvedValue(json(401, { detail: "Sign in." }));
    expect((await call("GET", ["documents"])).status).toBe(401);
    expect(jar.values.has(SESSION_COOKIE)).toBe(false);
  });

  it("refuses an oversized body, declared or not", async () => {
    const declared = await call("POST", ["documents"], { body: "x", headers: { "content-length": String(MAX_BODY_BYTES + 1) } });
    expect(declared.status).toBe(413);
    const undeclared = await call("POST", ["documents"], { body: endless() });
    expect(undeclared.status).toBe(413);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("answers, rather than throws, when the browser goes away mid-upload", async () => {
    const broken = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(10));
        controller.error(new Error("aborted"));
      },
    });
    expect((await call("POST", ["documents"], { body: broken })).status).toBe(400);
  });

  it("passes back only the listed headers, never a cookie, and does not follow redirects", async () => {
    fetchSpy.mockResolvedValue(
      json(200, { ok: true }, { "set-cookie": "df_session=evil", "retry-after": "5", "x-internal": "1", "content-disposition": "attachment" }),
    );
    const response = await call("GET", ["documents"]);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("x-internal")).toBeNull();
    expect(response.headers.get("retry-after")).toBe("5");
    expect(response.headers.get("content-disposition")).toBe("attachment");
    expect(fetchSpy.mock.calls[0][1]?.redirect).toBe("manual");
  });

  it("sends a write's body on", async () => {
    fetchSpy.mockResolvedValue(new Response(null, { status: 204 }));
    const response = await call("POST", ["documents", "d1", "claim"], { body: '{"take_over":false}', headers: { "content-type": "application/json" } });
    expect(response.status).toBe(204);
    const init = fetchSpy.mock.calls[0][1]!;
    expect(new TextDecoder().decode(init.body as ArrayBuffer)).toBe('{"take_over":false}');
    expect((init.headers as Headers).get("content-type")).toBe("application/json");
  });
});
