import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { fetchRunFile, filenameFrom, listRuns, monthSoFar, runSummary, startRun, type ExportRun } from "@/lib/exports";
import {
  blockedSentence, changeMapping, confirmRequest, createMapping, importMasters, importSummary, listMappings, mayMap, provenance, removeMapping,
  runSuggestions, type ItemTask, type SupplierMapping, type SupplierTask, type Tasks,
} from "@/lib/mappings";  // prettier-ignore

const fetchSpy = vi.fn<typeof fetch>();
beforeEach(() => {
  fetchSpy.mockReset();
  vi.stubGlobal("fetch", fetchSpy);
});
afterEach(() => vi.unstubAllGlobals());

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const sent = (call = 0) => ({ url: fetchSpy.mock.calls[call][0] as string, init: fetchSpy.mock.calls[call][1]! });

const supplier = (overrides: Partial<SupplierMapping> = {}): SupplierMapping => ({
  id: "s1", seller_gstin: "24AABFN7754K1Z0", printed_name: "ABC Pharma Pvt Ltd", tally_ledger: "ABC Pharma", marg_party: null,
  purchase_ledger: null, tax_treatment: null, source: "typed", created_by: "Asha", created_at: "2026-10-27T06:00:00Z", updated_by: null,
  updated_at: null, ...overrides,
});  // prettier-ignore

describe("the mappings API, through the app's proxy (V2 P1)", () => {
  it("lists a page of suppliers or items, searched, after a cursor", async () => {
    fetchSpy.mockImplementation(async () => json(200, { items: [], total: 0, next_after: null }));
    await listMappings("suppliers", "");
    await listMappings("items", "  cefixime 200 ", "cursor-1");
    expect(sent(0).url).toBe("/api/v1/settings/mappings/suppliers?limit=50");
    expect(sent(1).url).toBe("/api/v1/settings/mappings/items?limit=50&q=cefixime+200&after=cursor-1");
  });

  it("creates, changes and removes one", async () => {
    fetchSpy.mockResolvedValueOnce(json(201, supplier())).mockResolvedValueOnce(json(200, supplier())).mockResolvedValueOnce(new Response(null, { status: 204 }));
    await createMapping("suppliers", { seller_gstin: "24AABFN7754K1Z0", printed_name: "ABC Pharma Pvt Ltd", tally_ledger: "ABC Pharma", source: "typed" });
    await changeMapping("items", "i1", { tally_item: null, preferred_hsn: "30049099" });
    await removeMapping("suppliers", "s1");
    expect(sent(0).url).toBe("/api/v1/settings/mappings/suppliers");
    expect(sent(0).init.method).toBe("POST");
    expect(JSON.parse(sent(0).init.body as string)).toEqual({ seller_gstin: "24AABFN7754K1Z0", printed_name: "ABC Pharma Pvt Ltd", tally_ledger: "ABC Pharma", source: "typed" });
    expect(sent(1).url).toBe("/api/v1/settings/mappings/items/i1");
    expect(sent(1).init.method).toBe("PATCH");
    expect(JSON.parse(sent(1).init.body as string)).toEqual({ tally_item: null, preferred_hsn: "30049099" });
    expect(sent(2).url).toBe("/api/v1/settings/mappings/suppliers/s1");
    expect(sent(2).init.method).toBe("DELETE");
  });

  it("keeps the existing mapping's id from a 409, with the API's sentence", async () => {
    const detail = "24AABFN7754K1Z0 is already mapped to Tally ledger 'ABC Pharma', by Asha. Change that mapping instead.";
    fetchSpy.mockResolvedValue(json(409, { detail, existing_id: "s9" }));
    const caught = await createMapping("suppliers", { seller_gstin: "24AABFN7754K1Z0", printed_name: "ABC", tally_ledger: "X" }).catch((error: unknown) => error);
    expect(caught).toBeInstanceOf(ApiError);
    expect((caught as ApiError).detail).toBe(detail);
    expect((caught as ApiError).existingId).toBe("s9");
  });

  it("sends a masters file as multipart, letting the browser set its boundary", async () => {
    fetchSpy.mockResolvedValue(json(200, { rows: 3, imported: 2, already_known: 1, rejected: [] }));
    const file = new File(["name,type\nABC Pharma,supplier\n"], "masters.csv", { type: "text/csv" });
    const report = await importMasters(file);
    expect(report.imported).toBe(2);
    expect(sent().url).toBe("/api/v1/settings/mappings/import");
    expect(sent().init.method).toBe("POST");
    const body = sent().init.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect((body.get("file") as File).name).toBe("masters.csv");
    expect(sent().init.headers).toBeUndefined();
  });

  it("reads a run's tasks with their suggestions", async () => {
    fetchSpy.mockResolvedValue(json(200, { suppliers: [], items: [], problems: [] }));
    await runSuggestions("r1");
    expect(sent().url).toBe("/api/v1/settings/mappings/suggestions?export_run_id=r1");
  });
});

describe("export runs (V2 P1)", () => {
  it("starts a run for Tally or Marg over a range of dates, and lists them", async () => {
    fetchSpy.mockResolvedValue(json(201, {}));
    await startRun("marg", "2026-10-01", "2026-10-27");
    expect(sent().url).toBe("/api/v1/exports/runs");
    expect(JSON.parse(sent().init.body as string)).toEqual({ target: "marg", from: "2026-10-01", to: "2026-10-27" });
    fetchSpy.mockResolvedValue(json(200, []));
    await listRuns();
    expect(sent(1).url).toBe("/api/v1/exports/runs");
  });

  it("downloads a run's file under the name the API gave it, or refuses with its sentence", async () => {
    fetchSpy.mockResolvedValueOnce(new Response("a,b\n", { status: 200, headers: { "content-type": "text/csv", "content-disposition": 'attachment; filename="docforge-tally-2026-10.csv"' } }));
    const file = await fetchRunFile({ id: "r1", target: "tally", from: "2026-10-01", to: "2026-10-27" });
    expect(sent().url).toBe("/api/v1/exports/runs/r1/file");
    expect(file.filename).toBe("docforge-tally-2026-10.csv");
    expect(await file.blob.text()).toBe("a,b\n");

    fetchSpy.mockResolvedValueOnce(json(409, { detail: "This export made no file: 2 suppliers need mapping." }));
    const caught = await fetchRunFile({ id: "r2", target: "tally", from: "2026-10-01", to: "2026-10-27" }).catch((error: unknown) => error);
    expect((caught as ApiError).detail).toBe("This export made no file: 2 suppliers need mapping.");
  });

  it("names a download from its header, else from the run", () => {
    expect(filenameFrom('attachment; filename="x.csv"', "y.csv")).toBe("x.csv");
    expect(filenameFrom("attachment; filename=plain.csv", "y.csv")).toBe("plain.csv");
    expect(filenameFrom(null, "y.csv")).toBe("y.csv");
  });

  it("defaults to this month so far, in India's dates", () => {
    // 27 Oct 2026, 20:00 UTC is already 28 Oct in India.
    expect(monthSoFar(new Date("2026-10-27T20:00:00Z"))).toEqual({ from: "2026-10-01", to: "2026-10-28" });
    expect(monthSoFar(new Date("2026-10-31T19:00:00Z"))).toEqual({ from: "2026-11-01", to: "2026-11-01" });
  });

  it("sums up a ready run", () => {
    const run = { invoices: 12, lines: 1 } as ExportRun;
    expect(runSummary(run)).toBe("12 invoices, 1 line.");
  });
});

describe("mappings in words (V2 P1)", () => {
  it("says who made a mapping, from a suggestion or typed, and who changed it", () => {
    expect(provenance(supplier())).toBe("Created by Asha on 27 Oct 2026");
    expect(provenance(supplier({ source: "suggestion" }))).toBe("Confirmed from a suggestion by Asha on 27 Oct 2026");
    expect(provenance(supplier({ updated_by: "Ravi", updated_at: "2026-10-28T06:00:00Z" }))).toBe("Created by Asha on 27 Oct 2026 · Changed by Ravi on 28 Oct 2026");
  });

  it("lets only those who review change mappings", () => {
    expect(["admin", "reviewer", "member"].map((role) => mayMap(role))).toEqual([true, true, true]);
    expect(["reader", "observer", ""].map((role) => mayMap(role))).toEqual([false, false, false]);
    expect(mayMap("admin", true)).toBe(false); // viewing someone's workspace
  });

  it("reports an import in one line", () => {
    expect(importSummary({ rows: 1000, imported: 995, already_known: 0, rejected: [1, 2, 3, 4, 5].map((line) => ({ line, reason: "x" })) })).toBe(
      "Imported 995 names; 0 already known; 5 rows not imported:",
    );
    expect(importSummary({ rows: 2, imported: 1, already_known: 1, rejected: [] })).toBe("Imported 1 name; 1 already known.");
    expect(importSummary({ rows: 1, imported: 0, already_known: 0, rejected: [{ line: 2, reason: "x" }] })).toBe("Imported 0 names; 0 already known; 1 row not imported:");
  });

  it("says what stops an export", () => {
    const tasks = (s: number, i: number, p = 0): Tasks => ({
      suppliers: Array.from({ length: s }, () => ({}) as SupplierTask),
      items: Array.from({ length: i }, () => ({}) as ItemTask),
      problems: Array.from({ length: p }, () => ({ document_id: "d", filename: "f", problem: "x" })),
    });
    expect(blockedSentence(tasks(2, 3))).toBe("2 suppliers and 3 items need mapping before this export can be made. No file was made.");
    expect(blockedSentence(tasks(1, 0))).toBe("1 supplier needs mapping before this export can be made. No file was made.");
    expect(blockedSentence(tasks(0, 1))).toBe("1 item needs mapping before this export can be made. No file was made.");
    expect(blockedSentence(tasks(0, 0, 2))).toBe("2 bills need correcting before this export can be made. No file was made.");
  });
});

describe("confirming a task (V2 P1)", () => {
  const supplierTask: SupplierTask = { seller_gstin: "24AABFN7754K1Z0", printed_names: ["ABC PHARMA PVT LTD", "ABC Pharma"], bills: 4, mapping_id: null, suggestions: [] };
  const itemTask: ItemTask = { item_key: "k", product_name: "Cefixime 200 Tab", pack: "10x10", printed_hsn: "3004", bills: 2, mapping_id: null, suggestions: [] };

  it("creates a supplier mapping for the books, from a suggestion only when the name is the one clicked", () => {
    expect(confirmRequest({ kind: "supplier", task: supplierTask }, "tally", " ABC Pharma ", "ABC Pharma")).toEqual({
      path: "/settings/mappings/suppliers",
      method: "POST",
      json: { seller_gstin: "24AABFN7754K1Z0", printed_name: "ABC PHARMA PVT LTD", tally_ledger: "ABC Pharma", source: "suggestion" },
    });
    expect(confirmRequest({ kind: "supplier", task: supplierTask }, "marg", "ABC Pharma (Ahd)", "ABC Pharma").json).toEqual({
      seller_gstin: "24AABFN7754K1Z0", printed_name: "ABC PHARMA PVT LTD", marg_party: "ABC Pharma (Ahd)", source: "typed",
    });  // prettier-ignore
  });

  it("creates an item mapping with its pack and printed HSN", () => {
    expect(confirmRequest({ kind: "item", task: itemTask }, "marg", "CEFIX 200", null)).toEqual({
      path: "/settings/mappings/items",
      method: "POST",
      json: { product_name: "Cefixime 200 Tab", pack: "10x10", printed_hsn: "3004", marg_item: "CEFIX 200", source: "typed" },
    });
  });

  it("changes the mapping that has no name for these books yet", () => {
    expect(confirmRequest({ kind: "item", task: { ...itemTask, mapping_id: "i7" } }, "tally", "Cefix 200", "Cefix 200")).toEqual({
      path: "/settings/mappings/items/i7",
      method: "PATCH",
      json: { tally_item: "Cefix 200" },
    });
    expect(confirmRequest({ kind: "supplier", task: { ...supplierTask, mapping_id: "s7" } }, "marg", "ABC", null)).toEqual({
      path: "/settings/mappings/suppliers/s7",
      method: "PATCH",
      json: { marg_party: "ABC" },
    });
  });
});
