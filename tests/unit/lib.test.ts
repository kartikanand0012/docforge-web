import { describe, expect, it } from "vitest";
import { ApiError, errorFrom } from "@/lib/api";
import { hashGroups, hashShort, localTime, money, waiting } from "@/lib/format";
import { readEvents } from "@/lib/sse";
import { stageKind, stageStep, stageWord } from "@/lib/stages";

const NOW = new Date("2026-10-08T06:30:00Z"); // 12:00 in India

describe("money", () => {
  it("groups as Indian documents print it", () => {
    expect(money(412877.6)).toBe("₹4,12,877.60");
    expect(money("1180")).toBe("₹1,180.00");
    expect(money(null)).toBe("—");
  });
});

describe("times", () => {
  it("says today, or the day and month, in the viewer's zone", () => {
    expect(localTime("2026-10-08T06:14:00Z", { now: NOW, timeZone: "Asia/Kolkata" })).toBe("Today, 11:44");
    expect(localTime("2026-10-07T06:16:00Z", { now: NOW, timeZone: "Asia/Kolkata" })).toBe("7 Oct, 11:46");
    expect(localTime("2026-10-08T06:14:09Z", { now: NOW, timeZone: "Asia/Kolkata", seconds: true })).toBe(
      "Today, 11:44:09",
    );
  });

  it("says how long something has waited, in the largest whole unit", () => {
    expect(waiting("2026-10-06T06:00:00Z", NOW)).toBe("Waiting 2 days");
    expect(waiting("2026-10-08T03:00:00Z", NOW)).toBe("Waiting 3 hours");
    expect(waiting("2026-10-08T06:29:00Z", NOW)).toBe("Waiting 1 minute");
    expect(waiting("2026-10-08T06:29:50Z", NOW)).toBe("Just received");
  });
});

describe("hashes", () => {
  const sha = "9f3ce1b0aa11bb22cc33dd44ee55ff6600112233445566778899aabb0e1f2a71";
  it("shortens to its ends and groups in eights", () => {
    expect(hashShort(sha)).toBe("9f3ce1b0 … 0e1f2a71");
    expect(hashGroups(sha).split(" ")).toHaveLength(8);
  });
});

describe("stages", () => {
  it("names each stage in a word, with a kind that is never shown alone", () => {
    expect(stageWord("parsing")).toBe("Reading");
    expect(stageWord("processed")).toBe("Done");
    expect(stageKind("ready")).toBe("ok");
    expect(stageKind("failed")).toBe("fail");
    expect(stageKind("retrying")).toBe("warn");
    expect(stageKind("extracting")).toBe("info");
  });

  it("counts six steps, extraction the third", () => {
    expect(stageStep("extracting")).toEqual({ step: 3, of: 6 });
    expect(stageStep("ready")).toEqual({ step: 6, of: 6 });
    expect(stageStep("failed")).toBeNull();
  });
});

describe("API errors", () => {
  it("keeps the readable sentence, when to try again and which fields were wrong", () => {
    const limited = errorFrom(429, { detail: "Too many searches." }, new Headers({ "retry-after": "42" }));
    expect(limited).toBeInstanceOf(ApiError);
    expect([limited.status, limited.detail, limited.retryAfter]).toEqual([429, "Too many searches.", 42]);

    const invalid = errorFrom(422, { detail: [{ loc: ["body", "url"], msg: "bad" }] }, new Headers());
    expect(invalid.detail).toBe("Some of what was entered is not valid.");
    expect(invalid.fields).toEqual(["url"]);

    expect(errorFrom(503, null, new Headers()).detail).toMatch(/try again shortly/i);
  });
});

describe("server-sent events", () => {
  it("reads whole events, keeps a partial one, and takes a last one without its blank line", () => {
    const first = readEvents('event: stage\ndata: {"stage":"searching"}\n\nevent: ans');
    expect(first.events).toEqual([{ name: "stage", data: { stage: "searching" } }]);
    const last = readEvents(`${first.rest}wer\ndata: {"status":"supported"}`, { final: true });
    expect(last.events).toEqual([{ name: "answer", data: { status: "supported" } }]);
  });
});
