import { describe, expect, it } from "vitest";
import { declaredTooLarge, forwardedFor, sameOrigin } from "@/lib/server";

const request = (method: string, headers: Record<string, string>) =>
  new Request("http://localhost:3000/api/session", { method, headers });

describe("sameOrigin", () => {
  it("accepts a request from the page's own origin", () => {
    expect(sameOrigin(request("POST", { origin: "http://127.0.0.1:3011", host: "127.0.0.1:3011" }))).toBe(true);
  });

  it("refuses a state-changing request from another site", () => {
    expect(sameOrigin(request("POST", { origin: "https://evil.example", host: "127.0.0.1:3011" }))).toBe(false);
  });

  it("refuses a state-changing request with no origin", () => {
    expect(sameOrigin(request("POST", { host: "127.0.0.1:3011" }))).toBe(false);
    expect(sameOrigin(request("DELETE", { host: "127.0.0.1:3011" }))).toBe(false);
  });

  it("allows a plain read without an origin", () => {
    expect(sameOrigin(request("GET", { host: "127.0.0.1:3011" }))).toBe(true);
  });

  it("refuses a malformed origin", () => {
    expect(sameOrigin(request("POST", { origin: "not a url", host: "127.0.0.1:3011" }))).toBe(false);
  });
});

describe("cookieOptions", () => {
  it("is HttpOnly and SameSite=Strict, and Secure when the browser used HTTPS", async () => {
    const { cookieOptions } = await import("@/lib/server");
    const plain = cookieOptions(new Request("http://127.0.0.1:3011/api/session"));
    const proxied = cookieOptions(
      new Request("http://10.0.0.5:3000/api/session", { headers: { "x-forwarded-proto": "https" } }),
    );

    expect(plain).toMatchObject({ httpOnly: true, sameSite: "strict", secure: false });
    expect(proxied.secure).toBe(true);
  });
});

describe("forwardedFor", () => {
  const request = (xff?: string) =>
    new Request("https://demo.example.com/api/session", { headers: xff ? { "x-forwarded-for": xff } : {} });

  it("passes on the address the front proxy set, only where the proxy is trusted", () => {
    expect(forwardedFor(request("198.51.100.7"), { DOCFORGE_TRUST_PROXY: "1" })).toEqual({
      "X-Forwarded-For": "198.51.100.7",
    });
  });

  it("keeps only the address the edge appended, never one the browser chose", () => {
    const trusted = { DOCFORGE_TRUST_PROXY: "1" };
    expect(forwardedFor(request("10.0.0.99, 203.0.113.5"), trusted)).toEqual({ "X-Forwarded-For": "203.0.113.5" });
    const real = new Request("https://demo.example.com/api/session", { headers: { "x-forwarded-for": "10.0.0.99", "x-real-ip": "203.0.113.9" } });
    expect(forwardedFor(real, trusted)).toEqual({ "X-Forwarded-For": "203.0.113.9" });
    expect(forwardedFor(request("not an address"), trusted)).toEqual({});
  });

  it("drops it otherwise: a browser can send anything", () => {
    expect(forwardedFor(request("198.51.100.7"), {})).toEqual({});
    expect(forwardedFor(request(), { DOCFORGE_TRUST_PROXY: "1" })).toEqual({});
  });
});

describe("declaredTooLarge", () => {
  it("refuses a body declared larger than the limit", () => {
    const big = new Request("https://x/api", { method: "POST", headers: { "content-length": "20000000" } });
    const small = new Request("https://x/api", { method: "POST", headers: { "content-length": "100" } });
    expect(declaredTooLarge(big, 11 * 1024 * 1024)).toBe(true);
    expect(declaredTooLarge(small, 11 * 1024 * 1024)).toBe(false);
  });
});

import { FORWARDED_HEADERS } from "@/lib/server";

describe("headers passed back from the API", () => {
  it("include a download's name and whether an export was cut", () => {
    expect(FORWARDED_HEADERS).toEqual(
      expect.arrayContaining(["content-type", "cache-control", "retry-after", "content-disposition", "x-docforge-truncated"]),
    );
  });
});

import { readCapped, readSmallBody, safeDecode, detailFrom, tokenFrom, SMALL_BODY_BYTES } from "@/lib/server";

/** A body sent in pieces with no Content-Length, as a chunked upload is. */
function chunked(pieces: Uint8Array[], fail = false): Request {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const piece of pieces) controller.enqueue(piece);
      if (fail) controller.error(new Error("aborted"));
      else controller.close();
    },
  });
  return new Request("https://x/api", { method: "POST", body: stream, duplex: "half" } as RequestInit);
}

describe("declaredTooLarge at the edges", () => {
  const sized = (length?: string) =>
    new Request("https://x/api", { method: "POST", headers: length === undefined ? {} : { "content-length": length } });

  it("lets through a body exactly at the limit, a missing header and a header that is not a number", () => {
    expect(declaredTooLarge(sized("100"), 100)).toBe(false);
    expect(declaredTooLarge(sized("101"), 100)).toBe(true);
    expect(declaredTooLarge(sized(), 100)).toBe(false);
    expect(declaredTooLarge(sized("lots"), 100)).toBe(false);
  });
});

describe("readCapped", () => {
  it("reads a body up to and exactly at the limit", async () => {
    const body = await readCapped(chunked([new Uint8Array(60), new Uint8Array(40)]), 100);
    expect(body?.byteLength).toBe(100);
  });

  it("gives up as soon as an undeclared body passes the limit", async () => {
    expect(await readCapped(chunked([new Uint8Array(60), new Uint8Array(41)]), 100)).toBeNull();
  });

  it("reads no body as empty", async () => {
    expect((await readCapped(new Request("https://x/api", { method: "POST" }), 100))?.byteLength).toBe(0);
  });

  it("rejects when the sender goes away mid-body, for the caller to answer", async () => {
    await expect(readCapped(chunked([new Uint8Array(10)], true), 100)).rejects.toThrow();
  });
});

describe("readSmallBody", () => {
  it("reads a sign-in as text", async () => {
    const request = new Request("https://x/api", { method: "POST", body: JSON.stringify({ email: "a@b.in" }) });
    expect(await readSmallBody(request)).toBe('{"email":"a@b.in"}');
  });

  it("refuses a body declared too large without reading it, and one that lied about its size", async () => {
    const declared = new Request("https://x/api", { method: "POST", headers: { "content-length": String(SMALL_BODY_BYTES + 1) }, body: "x" });
    expect(await readSmallBody(declared)).toBeNull();
    expect(await readSmallBody(chunked([new Uint8Array(SMALL_BODY_BYTES + 1)]))).toBeNull();
  });
});

describe("tokenFrom", () => {
  const token = `dfs_0123456789ab_${"A".repeat(43)}`;

  it("takes a session token of the API's shape", () => {
    expect(tokenFrom({ token })).toBe(token);
  });

  it("trusts nothing else", () => {
    expect(tokenFrom(null)).toBeNull();
    expect(tokenFrom("dfs_x")).toBeNull();
    expect(tokenFrom({})).toBeNull();
    expect(tokenFrom({ token: 42 })).toBeNull();
    expect(tokenFrom({ token: "" })).toBeNull();
    expect(tokenFrom({ token: `${token}; Path=/` })).toBeNull();
    expect(tokenFrom({ token: token.replace("dfs_", "dfk_") })).toBeNull();
  });
});

describe("detailFrom", () => {
  it("passes on a sentence and nothing else", () => {
    expect(detailFrom({ detail: "Too many attempts." }, "Failed.")).toBe("Too many attempts.");
    expect(detailFrom({ detail: [{ loc: ["body", "email"] }] }, "Failed.")).toBe("Failed.");
    expect(detailFrom({ detail: "" }, null)).toBeNull();
    expect(detailFrom(null, "Failed.")).toBe("Failed.");
  });
});

describe("safeDecode", () => {
  it("decodes a cookie, and gives nothing for a missing or malformed one", () => {
    expect(safeDecode(encodeURIComponent("Acme Pharma · Pune"))).toBe("Acme Pharma · Pune");
    expect(safeDecode(undefined)).toBe("");
    expect(safeDecode("%E0%A4%A")).toBe("");
  });
});
