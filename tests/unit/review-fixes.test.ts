import { describe, expect, it } from "vitest";
import { isId } from "@/lib/ids";
import { callerFrom } from "@/lib/signin";
import { readEvents } from "@/lib/sse";
import { maskedUrl } from "@/lib/webhooks";

describe("server-sent events (TypeScript review M3)", () => {
  it("reads CRLF line ends, and a CR and LF split across two chunks", () => {
    const first = readEvents('event: stage\r\ndata: {"stage":"reading"}\r');
    expect(first.events).toEqual([]);
    const second = readEvents(`${first.rest}\n\r\nevent: answer\r\ndata: {"ok":1}\r\n\r\n`);
    expect(second.events).toEqual([
      { name: "stage", data: { stage: "reading" } },
      { name: "answer", data: { ok: 1 } },
    ]);
  });
});

describe("who is signed in (TypeScript review M6)", () => {
  it("is not signed out by the API being briefly unwell", () => {
    expect(callerFrom(503, null)?.role).toBe("reviewer");
    expect(callerFrom(500, null)).not.toBeNull();
    expect(callerFrom(401, null)).toBeNull();
    expect(callerFrom(403, null)).toBeNull();
  });
});

describe("webhook addresses (security review L3)", () => {
  it("never show an address in full, even one that cannot be parsed", () => {
    expect(maskedUrl("not a url ?token=secret")).toBe("(an address that could not be read)");
  });
});

describe("ids from the address bar (security review L1)", () => {
  it("are taken only when they look like the API's own", () => {
    expect(isId("e5d561bc-930a-47b5-a085-6958a79b3f33")).toBe(true);
    expect(isId("a/../../api-keys")).toBe(false);
    expect(isId("")).toBe(false);
  });
});
