import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import {
  acceptMessage, addSender, changeIntakeSettings, discardMessage, documentWords, getIntakeSettings, isHeld, itemWords, listMessages, makeAddress,
  mayChangeIntake, mayDecide, mayRetry, removeSender, retryItem, sendTest, settled, statusWords, type IntakeItem, type IntakeMessage,
} from "@/lib/intake";  // prettier-ignore

const fetchSpy = vi.fn<typeof fetch>();
beforeEach(() => {
  fetchSpy.mockReset();
  vi.stubGlobal("fetch", fetchSpy);
});
afterEach(() => vi.unstubAllGlobals());

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const sent = (call = 0) => ({ url: fetchSpy.mock.calls[call][0] as string, init: fetchSpy.mock.calls[call][1]! });

const item = (overrides: Partial<IntakeItem> = {}): IntakeItem => ({
  id: "i1", position: 0, filename: "bill.pdf", size_bytes: 2048, outcome: "received", reason: null, document_id: "d1", document_status: "processing",
  ...overrides,
});  // prettier-ignore
const message = (overrides: Partial<IntakeMessage> = {}): IntakeMessage => ({
  id: "m1", sender: "asha@supplier.in", subject: "Bill 42", status: "received", reason: null, received_at: "2026-11-03T06:00:00Z",
  decided_by: null, decided_at: null, items: [item()], ...overrides,
});  // prettier-ignore

describe("the email intake API, through the app's proxy (V2 P5)", () => {
  it("reads the settings, makes an address and sends a test", async () => {
    fetchSpy.mockImplementation(async () => json(200, {}));
    await getIntakeSettings();
    await makeAddress();
    await sendTest();
    expect(sent(0).url).toBe("/api/v1/settings/intake");
    expect(sent(0).init.method).toBeUndefined();
    expect([sent(1).url, sent(1).init.method]).toEqual(["/api/v1/settings/intake/address", "POST"]);
    expect([sent(2).url, sent(2).init.method]).toEqual(["/api/v1/settings/intake/test", "POST"]);
  });

  it("changes only what is given", async () => {
    fetchSpy.mockImplementation(async () => json(200, {}));
    await changeIntakeSettings({ trust_accepted: true });
    await changeIntakeSettings({ per_sender_hourly: 40 });
    expect([sent(0).url, sent(0).init.method, sent(0).init.body]).toEqual(["/api/v1/settings/intake", "PATCH", '{"trust_accepted":true}']);
    expect(sent(1).init.body).toBe('{"per_sender_hourly":40}');
  });

  it("adds a sender trimmed and removes one by id", async () => {
    fetchSpy.mockResolvedValueOnce(json(201, { id: "s1", sender: "@supplier.in", created_by: "Asha", created_at: "2026-11-03T06:00:00Z" }));
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await addSender("  @supplier.in ");
    await removeSender("s/1");
    expect([sent(0).url, sent(0).init.method, sent(0).init.body]).toEqual(["/api/v1/settings/intake/senders", "POST", '{"sender":"@supplier.in"}']);
    expect([sent(1).url, sent(1).init.method]).toEqual(["/api/v1/settings/intake/senders/s%2F1", "DELETE"]);
  });

  it("gives the API's sentence when a sender is refused", async () => {
    fetchSpy.mockResolvedValue(json(422, { detail: "@supplier.in is already on the list." }));
    const error = await addSender("@supplier.in").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).detail).toBe("@supplier.in is already on the list.");
  });

  it("lists mail by view, and accepts, discards and retries", async () => {
    fetchSpy.mockImplementation(async () => json(200, []));
    await listMessages();
    await listMessages("held", 5);
    await acceptMessage("m1");
    await discardMessage("m1");
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 202 }));
    await retryItem("i1");
    expect(fetchSpy.mock.calls.map(([url, init]) => `${init?.method ?? "GET"} ${String(url)}`)).toEqual([
      "GET /api/v1/intake/messages?view=all&limit=50",
      "GET /api/v1/intake/messages?view=held&limit=5",
      "POST /api/v1/intake/messages/m1/accept",
      "POST /api/v1/intake/messages/m1/discard",
      "POST /api/v1/intake/items/i1/retry",
    ]);
  });
});

describe("what the Intake list says", () => {
  it("words each attachment's outcome plainly", () => {
    expect(itemWords(item())).toBe("received");
    expect(itemWords(item({ outcome: "already_received" }))).toBe("already received");
    expect(itemWords(item({ outcome: "ignored", reason: "a text note, not a bill" }))).toBe("ignored: a text note, not a bill");
    expect(itemWords(item({ outcome: "refused", reason: "The file is too large." }))).toBe("not accepted: The file is too large.");
    expect(itemWords(item({ outcome: "held", reason: "the sender is not on this workspace's list" }))).toBe(
      "held: the sender is not on this workspace's list",
    );
    expect(itemWords(item({ outcome: "discarded" }))).toBe("discarded");
  });

  it("words a mail's status and a document's progress", () => {
    expect(statusWords("held")).toBe("Held for review");
    expect(statusWords("rejected")).toBe("Rejected");
    expect(documentWords("processing")).toBe("being read");
    expect(documentWords("processed")).toBe("read");
    expect(documentWords("failed")).toBe("reading failed");
    expect(documentWords(null)).toBeNull();
  });

  it("offers Accept / Discard while anything is held, and Retry for a failed reading", () => {
    expect(isHeld(message({ status: "held", items: [item({ outcome: "held", document_id: null, document_status: null })] }))).toBe(true);
    expect(isHeld(message())).toBe(false);
    expect(mayRetry(item({ document_status: "failed" }))).toBe(true);
    expect(mayRetry(item({ document_status: "ready" }))).toBe(false);
  });

  it("knows when a test mail has finished arriving", () => {
    expect(settled(message())).toBe(false);
    expect(settled(message({ items: [item({ document_status: "processed" })] }))).toBe(true);
    expect(settled(message({ items: [item({ outcome: "ignored", document_id: null, document_status: null })] }))).toBe(true);
  });

  it("lets administrators (and a personal workspace's person) change the settings, and reviewers decide", () => {
    expect(mayChangeIntake("admin")).toBe(true);
    expect(mayChangeIntake("member")).toBe(true);
    expect(mayChangeIntake("reviewer")).toBe(false);
    expect(mayChangeIntake("admin", true)).toBe(false);
    expect(mayDecide("reviewer")).toBe(true);
    expect(mayDecide("reader")).toBe(false);
    expect(mayDecide("observer")).toBe(false);
    expect(mayDecide("admin", true)).toBe(false);
  });
});

describe("what the app says about email intake", () => {
  it("never promises WhatsApp, nor bill details in the email reply", async () => {
    const { readdirSync, readFileSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");
    const files = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        return statSync(path).isDirectory() ? files(path) : /\.(ts|tsx)$/.test(name) ? [path] : [];
      });
    const found = files(join(process.cwd(), "src")).flatMap((path) =>
      readFileSync(path, "utf8")
        .split("\n")
        .filter((line) => /whatsapp/i.test(line) || /reply[^.]*\b(amount|total|gstin|value|detail)s?\b/i.test(line))
        .map((line) => `${path}: ${line.trim()}`),
    );
    expect(found).toEqual([]);
  });
});
