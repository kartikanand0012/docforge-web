import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { fetchRunFile, overlapSentence, runExport, startRun, type ExportRun } from "@/lib/exports";
import {
  activateProfile, basisOf, checkProfile, checkSummary, createProfile, draftFromSample, draftFromSpec, getTemplate, listFields, listProfiles,
  listVersions, parseIds, readSample, saveVersion, specFromDraft, type Column, type ProfileSpec, type Sample,
} from "@/lib/profiles";  // prettier-ignore

const fetchSpy = vi.fn<typeof fetch>();
beforeEach(() => {
  fetchSpy.mockReset();
  vi.stubGlobal("fetch", fetchSpy);
});
afterEach(() => vi.unstubAllGlobals());

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const sent = (call = 0) => ({ url: fetchSpy.mock.calls[call][0] as string, init: fetchSpy.mock.calls[call][1]! });

const FORMAT = { date: null, month_day: "first" as const, decimals: null, codes: {}, upper: false, empty: "" };
const col = (header: string, source: Column["source"], field: string | null, extra: Partial<Column> = {}): Column => ({
  header, source, field, value: null, format: FORMAT, cell: "text", required: false, ...extra,
});  // prettier-ignore
const SPEC: ProfileSpec = {
  file_type: "csv", layout: "per_line", delimiter: ",", quoting: "minimal", header_row: true, line_end: "crlf", encoding: "utf-8",
  sheet_name: "Sheet1", free_qty: "column", columns: [col("Item", "mapping", "item"), col("Batch", "line", "batch_no", { required: true })],
};  // prettier-ignore

describe("the Marg profile API, through the app's proxy (V2 P3)", () => {
  it("lists profiles, the SAMPLE template, the fields and a profile's versions", async () => {
    fetchSpy.mockImplementation(async () => json(200, []));
    await listProfiles();
    await getTemplate();
    await listFields();
    await listVersions("p1");
    expect(fetchSpy.mock.calls.map(([url]) => url)).toEqual([
      "/api/v1/settings/export-profiles",
      "/api/v1/settings/export-profiles/template",
      "/api/v1/settings/export-profiles/fields",
      "/api/v1/settings/export-profiles/p1/versions",
    ]);
  });

  it("sends a file to read as multipart, letting the browser set its boundary", async () => {
    fetchSpy.mockResolvedValue(json(200, { file_type: "csv", delimiter: ",", header_row: true, encoding: "utf-8", sheet_name: "Sheet1", rows: 3, columns: [] }));
    const file = new File(["Item,Batch\n"], "accepted.csv", { type: "text/csv" });
    await readSample(file);
    expect(sent().url).toBe("/api/v1/settings/export-profiles/read-sample");
    expect(sent().init.method).toBe("POST");
    const body = sent().init.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect((body.get("file") as File).name).toBe("accepted.csv");
    expect(sent().init.headers).toBeUndefined();
  });

  it("creates a profile, saves a new version and makes one active", async () => {
    fetchSpy.mockImplementation(async () => json(200, {}));
    await createProfile("Shah Medicals", "upload", SPEC);
    await saveVersion("p1", "manual", SPEC);
    await saveVersion("p1", "upload", SPEC, "Renamed");
    await activateProfile("p1");
    expect(sent(0).url).toBe("/api/v1/settings/export-profiles");
    expect(sent(0).init.method).toBe("POST");
    expect(JSON.parse(sent(0).init.body as string)).toEqual({ name: "Shah Medicals", basis: "upload", spec: SPEC });
    expect(sent(1).url).toBe("/api/v1/settings/export-profiles/p1");
    expect(sent(1).init.method).toBe("PUT");
    expect(JSON.parse(sent(1).init.body as string)).toEqual({ basis: "manual", spec: SPEC });
    expect(JSON.parse(sent(2).init.body as string)).toEqual({ basis: "upload", spec: SPEC, name: "Renamed" });
    expect(sent(3).url).toBe("/api/v1/settings/export-profiles/p1/activate");
    expect(sent(3).init.method).toBe("POST");
  });

  it("keeps the API's sentence when a layout is refused", async () => {
    const detail = "This layout cannot be used: A line-by-line file must carry the batch (line.batch_no).";
    fetchSpy.mockResolvedValue(json(422, { detail }));
    const caught = await createProfile("X", "upload", SPEC).catch((error: unknown) => error);
    expect(caught).toBeInstanceOf(ApiError);
    expect((caught as ApiError).detail).toBe(detail);
  });

  it("checks a profile with the accepted file and the bills' ids, comma-separated, as multipart", async () => {
    fetchSpy.mockResolvedValue(json(200, { version_no: 2, bills: 2, exact: true, rows_expected: 4, rows_produced: 4, cells: 40, equal: 40, diffs: [], tasks: null }));
    const file = new File(["x"], "marg.xlsx");
    await checkProfile("p1", file, parseIds("d1,\n d2 \n\n"));
    expect(sent().url).toBe("/api/v1/settings/export-profiles/p1/check");
    expect(sent().init.method).toBe("POST");
    const body = sent().init.body as FormData;
    expect((body.get("file") as File).name).toBe("marg.xlsx");
    expect(body.get("document_ids")).toBe("d1,d2");
    expect(sent().init.headers).toBeUndefined();
  });

  it("says how a check went", () => {
    const base = { version_no: 1, bills: 2, exact: false, diffs: [], tasks: null };
    expect(checkSummary({ ...base, rows_expected: 4, rows_produced: 4, cells: 40, equal: 38 })).toBe("38 of 40 cells match.");
    expect(checkSummary({ ...base, rows_expected: 4, rows_produced: 5, cells: 40, equal: 30 })).toBe("30 of 40 cells match; Marg's file has 4 rows, ours 5.");
    expect(checkSummary({ ...base, rows_expected: null, rows_produced: null, cells: null, equal: null })).toMatch(/could not be compared yet/);
  });
});

describe("a Marg purchase import run (V2 P3)", () => {
  it("names its format; a mapped CSV is sent as before", async () => {
    fetchSpy.mockImplementation(async () => json(201, {}));
    await startRun("marg", "2026-10-01", "2026-10-27", "marg_import");
    await startRun("tally", "2026-10-01", "2026-10-27");
    expect(JSON.parse(sent(0).init.body as string)).toEqual({ target: "marg", from: "2026-10-01", to: "2026-10-27", format: "marg_import" });
    expect(JSON.parse(sent(1).init.body as string)).toEqual({ target: "tally", from: "2026-10-01", to: "2026-10-27" });
  });

  it("turns the API's 409 no_active_profile into a state, and throws any other refusal", async () => {
    const detail = "There is no active Marg profile.";
    fetchSpy.mockResolvedValueOnce(json(409, { detail, code: "no_active_profile" }));
    expect(await runExport("marg", "2026-10-01", "2026-10-27", "marg_import")).toEqual({ kind: "no_active_profile", detail });

    fetchSpy.mockResolvedValueOnce(json(409, { detail: "Something else." }));
    const caught = await runExport("marg", "2026-10-01", "2026-10-27", "marg_import").catch((error: unknown) => error);
    expect(caught).toBeInstanceOf(ApiError);
    expect((caught as ApiError).code).toBeNull();

    fetchSpy.mockResolvedValueOnce(json(201, { id: "r1" }));
    expect(await runExport("marg", "2026-10-01", "2026-10-27", "marg_import")).toEqual({ kind: "run", run: { id: "r1" } });
  });

  it("downloads an Excel import under the run's own filename when the API sends none", async () => {
    fetchSpy.mockResolvedValue(new Response("xlsx-bytes", { status: 200 }));
    const run = { id: "r1", target: "marg", from: "2026-10-01", to: "2026-10-27", file: { filename: "marg-import.xlsx", sha256: "a", size_bytes: 1 } } as ExportRun;
    expect((await fetchRunFile(run)).filename).toBe("marg-import.xlsx");
  });

  it("says when bills were exported before, by the day in India", () => {
    expect(overlapSentence({ run_id: "r0", created_at: "2026-10-12T05:00:00Z", format: "mapped_csv", invoices: 12 })).toBe(
      "12 of these bills were already in the export of 12 Oct 2026.",
    );
    expect(overlapSentence({ run_id: "r0", created_at: "2026-10-12T20:00:00Z", format: "marg_import", invoices: 1 })).toBe(
      "1 of these bills was already in the Marg purchase import of 13 Oct 2026.",
    );
  });
});

describe("the profile editor's draft (V2 P3)", () => {
  const sample: Sample = {
    file_type: "csv", delimiter: ";", header_row: true, encoding: "utf-8-sig", sheet_name: "Sheet1", rows: 6,
    columns: [
      { header: "ITEM", examples: ["CEFIX 200"], offer: col("ITEM", "mapping", "item") },
      { header: "BATCH", examples: ["B123"], offer: col("BATCH", "line", "batch_no") },
      { header: "QTY", examples: ["10"], offer: null },
      { header: "SCHEME", examples: ["2"], offer: null },
    ],
  };  // prettier-ignore

  it("fills each offer in, marked, and leaves a column with none unset; the file's settings as read", () => {
    const draft = draftFromSample(sample, "accepted.csv");
    expect(draft.settings).toMatchObject({ file_type: "csv", delimiter: ";", header_row: true, encoding: "utf-8-sig" });
    expect(draft.columns.map((c) => c.source)).toEqual(["mapping", "line", null, null]);
    expect(draft.columns[0].offered?.field).toBe("item");
    expect(draft.columns[2].offered).toBeNull();
    expect(basisOf(draft)).toBe("upload");
  });

  it("will not make a layout with columns unchosen, and names them", () => {
    const draft = draftFromSample(sample, "accepted.csv");
    expect(specFromDraft(draft)).toEqual({
      error: "Choose where 2 columns come from before saving: QTY, SCHEME. Nothing was saved.",
      unset: [2, 3],
    });
    draft.columns[2] = { ...draft.columns[2], source: "line", field: "qty" };
    draft.columns[3] = { ...draft.columns[3], source: "constant", field: "ignored", value: "" };
    const made = specFromDraft(draft);
    expect("spec" in made && made.spec.columns.map((c) => [c.header, c.source, c.field, c.value])).toEqual([
      ["ITEM", "mapping", "item", null],
      ["BATCH", "line", "batch_no", null],
      ["QTY", "line", "qty", null],
      ["SCHEME", "constant", null, ""],
    ]);
    expect("spec" in made && Object.keys(made.spec.columns[0]).sort()).toEqual(["cell", "field", "format", "header", "required", "source", "value"]);
  });

  it("keeps the SAMPLE as the SAMPLE, and an edited version as by hand", () => {
    expect(basisOf(draftFromSpec(SPEC, "sample", "SAMPLE"))).toBe("sample");
    expect(basisOf(draftFromSpec(SPEC, "version", "v1"))).toBe("manual");
    expect(specFromDraft(draftFromSpec(SPEC, "version", "v1"))).toEqual({ spec: SPEC });
  });
});
