import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => vi.fn());
const who = vi.hoisted(() => ({ role: "reviewer", viewing: false }));
vi.mock("@/lib/api", () => ({
  api,
  apiUrl: (path: string) => `/api/v1${path}`,
  ApiError: class extends Error {
    constructor(
      readonly status: number,
      readonly detail: string,
    ) {
      super(detail);
    }
  },
}));
vi.mock("@/components/Shell", () => ({
  useCaller: () => ({ kind: "session", name: "Asha", email: null, role: who.role, organisation: "Shah Medicals" }),
  useViewing: () => who.viewing,
}));

import MargProfilePage from "@/app/(app)/settings/marg-profile/page";
import { ApiError } from "@/lib/api";
import type { Column, FieldDef, MargProfile, ProfileSpec, Sample } from "@/lib/profiles";

const FORMAT = { date: null, month_day: "first" as const, decimals: null, codes: {}, upper: false, empty: "" };
const col = (header: string, source: Column["source"], field: string | null, extra: Partial<Column> = {}): Column => ({
  header, source, field, value: null, format: FORMAT, cell: "text", required: false, ...extra,
});  // prettier-ignore
const SPEC: ProfileSpec = {
  file_type: "csv", layout: "per_line", delimiter: ",", quoting: "minimal", header_row: true, line_end: "crlf", encoding: "utf-8",
  sheet_name: "Sheet1", free_qty: "column", columns: [col("Item", "mapping", "item"), col("Batch", "line", "batch_no")],
};  // prettier-ignore

const FIELDS: FieldDef[] = [
  { source: "invoice", field: "invoice_no", kind: "text", label: "Supplier's invoice number", per_line_only: false },
  { source: "invoice", field: "invoice_date", kind: "date", label: "Invoice date", per_line_only: false },
  { source: "line", field: "batch_no", kind: "text", label: "Batch", per_line_only: true },
  { source: "line", field: "qty", kind: "int", label: "Quantity", per_line_only: true },
  { source: "line", field: "free_qty", kind: "int", label: "Free (scheme) quantity", per_line_only: true },
  { source: "mapping", field: "item", kind: "text", label: "Item as your Marg names it", per_line_only: true },
  { source: "mapping", field: "party", kind: "text", label: "Supplier as your Marg names it", per_line_only: false },
];

const SAMPLE_READ: Sample = {
  file_type: "csv", delimiter: ",", header_row: true, encoding: "utf-8", sheet_name: "Sheet1", rows: 4,
  columns: [
    { header: "BILL DATE", examples: ["01-10-2026"], offer: col("BILL DATE", "invoice", "invoice_date", { format: { ...FORMAT, date: "DD-MM-YYYY" } }) },
    { header: "ITEM NAME", examples: ["CEFIX 200 TAB"], offer: col("ITEM NAME", "mapping", "item") },
    { header: "QTY", examples: ["10", "20"], offer: null },
  ],
};  // prettier-ignore

const profile = (overrides: Partial<MargProfile> = {}): MargProfile => ({
  id: "p1", target: "marg", name: "Shah Medicals", active: true,
  latest: { id: "v2", version_no: 2, basis: "upload", sample: false, spec: SPEC, created_by: "Asha", created_at: "2026-10-20T06:00:00Z" },
  created_by: "Asha", created_at: "2026-10-01T06:00:00Z", updated_by: null, updated_at: null, ...overrides,
});  // prettier-ignore
const trial = profile({
  id: "p2", name: "Trial", active: false,
  latest: { id: "v9", version_no: 1, basis: "sample", sample: true, spec: SPEC, created_by: "Ravi", created_at: "2026-10-02T06:00:00Z" },
});  // prettier-ignore

type Handler = (path: string, init?: { method?: string; json?: unknown; body?: unknown }) => unknown;
function serve(handler: Handler) {
  api.mockImplementation((path: string, init?: { method?: string; json?: unknown; body?: unknown }) => {
    try {
      return Promise.resolve(handler(path, init));
    } catch (error) {
      return Promise.reject(error);
    }
  });
}
const base: Handler = (path) => {
  if (path === "/settings/export-profiles") return [profile(), trial];
  if (path === "/settings/export-profiles/fields") return FIELDS;
  if (path === "/settings/export-profiles/read-sample") return SAMPLE_READ;
  if (path === "/settings/export-profiles/template") return { name: "SAMPLE (made-up layout, not a Marg format)", basis: "sample", spec: SPEC };
  if (path.endsWith("/versions"))
    return [
      { ...profile().latest },
      { id: "v1", version_no: 1, basis: "sample", sample: true, spec: SPEC, created_by: "Ravi", created_at: "2026-10-01T06:00:00Z" },
    ];
  return {};
};
const lastCall = (method: string) => api.mock.calls.filter(([, init]) => init?.method === method).at(-1);

async function uploadSample() {
  const file = new File(["BILL DATE,ITEM NAME,QTY\n"], "accepted.csv", { type: "text/csv" });
  await userEvent.upload(screen.getByLabelText("Upload a file your Marg accepted"), file);
  return screen.findByRole("form", { name: "The layout of your file" });
}
const column = (form: HTMLElement, header: string) => within(form).getByRole("group", { name: new RegExp(header) });

beforeEach(() => {
  api.mockReset();
  who.role = "reviewer";
  who.viewing = false;
});

describe("Settings › Marg profile (V2 P3)", () => {
  it("lists the profiles, active first, with their version, the SAMPLE marked, and each one's versions", async () => {
    serve(base);
    render(<MargProfilePage />);
    const list = await screen.findByRole("list", { name: "Marg profiles" });
    const [active, other] = within(list).getAllByRole("article");
    expect(active).toHaveTextContent("Shah Medicals");
    expect(within(active).getByText("Active")).toBeInTheDocument();
    expect(active).toHaveTextContent("Version 2");
    expect(within(active).queryByText("SAMPLE layout — made up, not a Marg format")).toBeNull();
    expect(within(active).queryByRole("button", { name: "Make active" })).toBeNull();
    expect(within(other).getByText("SAMPLE layout — made up, not a Marg format")).toBeInTheDocument();

    await userEvent.click(within(active).getByRole("button", { name: "Versions" }));
    expect(api).toHaveBeenCalledWith("/settings/export-profiles/p1/versions");
    const versions = await within(active).findByRole("table", { name: "Versions of Shah Medicals" });
    const rows = within(versions).getAllByRole("row").slice(1);
    expect(rows[0]).toHaveTextContent("2");
    expect(rows[0]).toHaveTextContent("A file your Marg accepted");
    expect(rows[0]).toHaveTextContent("Asha");
    expect(rows[1]).toHaveTextContent("The SAMPLE layout");
    expect(rows[1]).toHaveTextContent("Ravi");

    await userEvent.click(within(other).getByRole("button", { name: "Make active" }));
    expect(lastCall("POST")).toEqual(["/settings/export-profiles/p2/activate", { method: "POST" }]);
  });

  it.each([
    { role: "reader", viewing: false },
    { role: "admin", viewing: true },
  ])("shows a $role (viewing: $viewing) the profiles only", async ({ role, viewing }) => {
    who.role = role;
    who.viewing = viewing;
    serve(base);
    render(<MargProfilePage />);
    const list = await screen.findByRole("list", { name: "Marg profiles" });
    expect(within(list).queryByRole("button", { name: /Make active|Edit|Check/ })).toBeNull();
    expect(within(list).getAllByRole("button", { name: "Versions" })).toHaveLength(2);
    expect(screen.queryByLabelText("Upload a file your Marg accepted")).toBeNull();
    expect(screen.queryByRole("button", { name: "Start from the SAMPLE layout" })).toBeNull();
    expect(screen.getByText(/Only someone who reviews bills can change it/)).toBeInTheDocument();
  });

  it("reads an accepted file: offers are filled in and marked, a column with none is left for the person, and blocks saving until chosen", async () => {
    serve(base);
    render(<MargProfilePage />);
    const form = await uploadSample();
    const sent = api.mock.calls.find(([path]) => path === "/settings/export-profiles/read-sample")!;
    expect(sent[1].method).toBe("POST");
    expect(((sent[1].body as FormData).get("file") as File).name).toBe("accepted.csv");

    const date = column(form, "BILL DATE");
    expect(within(date).getByLabelText("Takes")).toHaveValue("invoice:invoice_date");
    expect(within(date).getByText("Suggested from the file: check it")).toBeInTheDocument();
    expect(within(date).getByLabelText("Date written as")).toHaveValue("DD-MM-YYYY");
    expect(date).toHaveTextContent("In the file: ‘01-10-2026’");

    const qty = column(form, "QTY");
    expect(within(qty).getByLabelText("Takes")).toHaveValue("");
    expect(within(qty).getByText("Not chosen: choose where this comes from")).toBeInTheDocument();
    expect(within(qty).queryByText("Suggested from the file: check it")).toBeNull();

    // The file's settings, as read, can be changed.
    expect(within(form).getByLabelText("File type")).toHaveValue("csv");
    expect(within(form).getByLabelText("Separator")).toHaveValue(",");
    expect(within(form).getByLabelText("The first row is the headers")).toBeChecked();
    expect(within(form).getByRole("radio", { name: "Its own column" })).toBeChecked();

    await userEvent.type(within(form).getByLabelText("Profile name"), "Shah Medicals 2");
    await userEvent.click(within(form).getByRole("button", { name: "Save profile" }));
    expect(within(form).getByRole("alert")).toHaveTextContent("Choose where 1 column comes from before saving: QTY. Nothing was saved.");
    expect(within(qty).getByLabelText("Takes")).toHaveAttribute("aria-invalid", "true");
    expect(lastCall("POST")?.[0]).toBe("/settings/export-profiles/read-sample"); // nothing saved

    // A chosen source is no longer marked a suggestion; editing the format is kept.
    await userEvent.selectOptions(within(qty).getByLabelText("Takes"), "line:qty");
    await userEvent.selectOptions(within(qty).getByLabelText("Decimals"), "0");
    await userEvent.click(within(qty).getByLabelText(/Required/));
    await userEvent.selectOptions(within(column(form, "ITEM NAME")).getByLabelText("Takes"), "constant");
    await userEvent.type(within(column(form, "ITEM NAME")).getByLabelText("Text on every row"), "X");
    expect(within(column(form, "ITEM NAME")).getByText(/Changed from the suggestion/)).toBeInTheDocument();
    await userEvent.click(within(date).getByLabelText("Upper case"));

    serve((path, init) => (init?.method === "POST" && path === "/settings/export-profiles" ? profile({ id: "p3", name: "Shah Medicals 2", active: false }) : base(path, init)));
    await userEvent.click(within(form).getByRole("button", { name: "Save profile" }));
    const [path, init] = lastCall("POST")!;
    expect(path).toBe("/settings/export-profiles");
    const body = init.json as { name: string; basis: string; spec: ProfileSpec };
    expect(body.name).toBe("Shah Medicals 2");
    expect(body.basis).toBe("upload");
    expect(body.spec.columns.map((c) => [c.header, c.source, c.field, c.value])).toEqual([
      ["BILL DATE", "invoice", "invoice_date", null],
      ["ITEM NAME", "constant", null, "X"],
      ["QTY", "line", "qty", null],
    ]);
    expect(body.spec.columns[2]).toMatchObject({ required: true, format: { decimals: 0 } });
    expect(body.spec.columns[0].format).toMatchObject({ date: "DD-MM-YYYY", upper: true });
    expect(await screen.findByText(/Saved ‘Shah Medicals 2’, version 2\. Make it active/)).toBeInTheDocument();
  });

  it("shows the API's sentence word for word when it refuses the layout", async () => {
    const detail = "This layout cannot be used: A line-by-line file must carry the batch (line.batch_no).";
    serve((path, init) => {
      if (init?.method === "POST" && path === "/settings/export-profiles") throw new ApiError(422, detail);
      return base(path, init);
    });
    render(<MargProfilePage />);
    const form = await uploadSample();
    await userEvent.selectOptions(within(column(form, "QTY")).getByLabelText("Takes"), "line:qty");
    await userEvent.type(within(form).getByLabelText("Profile name"), "Mine");
    await userEvent.click(within(form).getByRole("button", { name: "Save profile" }));
    expect(await within(form).findByRole("alert")).toHaveTextContent(detail);
  });

  it("saves an accepted file's layout as the next version of a profile", async () => {
    serve(base);
    render(<MargProfilePage />);
    const form = await uploadSample();
    await userEvent.selectOptions(within(column(form, "QTY")).getByLabelText("Takes"), "line:free_qty");
    await userEvent.selectOptions(within(form).getByLabelText("Save as"), "p1");
    expect(within(form).queryByLabelText("Profile name")).toBeNull();
    await userEvent.click(within(form).getByRole("button", { name: "Save profile" }));
    const [path, init] = lastCall("PUT")!;
    expect(path).toBe("/settings/export-profiles/p1");
    expect((init.json as { basis: string }).basis).toBe("upload");
  });

  it("hides fields only a line-by-line file has when the file is one row per bill", async () => {
    serve(base);
    render(<MargProfilePage />);
    const form = await uploadSample();
    const takes = within(column(form, "QTY")).getByLabelText("Takes");
    expect(within(takes).getByRole("option", { name: "Batch" })).toBeInTheDocument();
    expect(within(takes).getByRole("option", { name: "Same text on every row" })).toBeInTheDocument();
    expect(within(takes).getByRole("option", { name: "Leave blank" })).toBeInTheDocument();
    await userEvent.selectOptions(within(form).getByLabelText("Rows"), "per_invoice");
    expect(within(takes).queryByRole("option", { name: "Batch" })).toBeNull();
    expect(within(takes).getByRole("option", { name: "Supplier as your Marg names it" })).toBeInTheDocument();
    expect(within(form).queryByRole("radio", { name: "Its own column" })).toBeNull();
  });

  it("starts from the SAMPLE layout under its own name, and saves it as the SAMPLE", async () => {
    serve(base);
    render(<MargProfilePage />);
    await userEvent.click(await screen.findByRole("button", { name: "Start from the SAMPLE layout" }));
    const form = await screen.findByRole("form", { name: "The SAMPLE layout" });
    expect(within(form).getByText("SAMPLE (made-up layout, not a Marg format)")).toBeInTheDocument();
    expect(within(form).getByText("SAMPLE layout — made up, not a Marg format")).toBeInTheDocument();
    await userEvent.type(within(form).getByLabelText("Profile name"), "Trying it");
    await userEvent.click(within(form).getByRole("button", { name: "Save profile" }));
    const [path, init] = lastCall("POST")!;
    expect(path).toBe("/settings/export-profiles");
    expect(init.json).toEqual({ name: "Trying it", basis: "sample", spec: SPEC });
  });

  it("edits a profile as its next version, by hand", async () => {
    serve(base);
    render(<MargProfilePage />);
    const list = await screen.findByRole("list", { name: "Marg profiles" });
    await userEvent.click(within(within(list).getAllByRole("article")[0]).getByRole("button", { name: "Edit as a new version" }));
    const form = await screen.findByRole("form", { name: "Edit the layout" });
    expect(within(form).getByLabelText("Save as")).toHaveValue("p1");
    await userEvent.click(within(form).getByRole("button", { name: "Save profile" }));
    expect(lastCall("PUT")).toEqual(["/settings/export-profiles/p1", { method: "PUT", json: { basis: "manual", spec: SPEC } }]);
  });

  it("checks a profile against a file Marg accepted: exact or not, cells equal, and each cell that differs", async () => {
    const result = {
      version_no: 2, bills: 2, exact: false, rows_expected: 4, rows_produced: 4, cells: 40, equal: 38,
      diffs: [
        { row: 2, column: "EXPIRY", expected: "31-03-2028", produced: "01-03-2028" },
        { row: 3, column: "FREE", expected: "0", produced: "" },
      ],
      tasks: null,
    };  // prettier-ignore
    serve((path, init) => (path.endsWith("/check") ? result : base(path, init)));
    render(<MargProfilePage />);
    const list = await screen.findByRole("list", { name: "Marg profiles" });
    await userEvent.click(within(within(list).getAllByRole("article")[0]).getByRole("button", { name: "Check against a file Marg accepted" }));
    const panel = await screen.findByRole("region", { name: "Check ‘Shah Medicals’ against a file Marg accepted" });

    await userEvent.click(within(panel).getByRole("button", { name: "Check" }));
    expect(within(panel).getByRole("alert")).toHaveTextContent("Choose the import file Marg accepted.");

    await userEvent.upload(within(panel).getByLabelText(/The import file Marg accepted/), new File(["x"], "marg-accepted.csv"));
    await userEvent.type(within(panel).getByLabelText(/The bills in that file/), "d1\nd2");
    await userEvent.click(within(panel).getByRole("button", { name: "Check" }));
    const [path, init] = lastCall("POST")!;
    expect(path).toBe("/settings/export-profiles/p1/check");
    expect((init.body as FormData).get("document_ids")).toBe("d1,d2");
    expect(((init.body as FormData).get("file") as File).name).toBe("marg-accepted.csv");

    expect(await within(panel).findByText("Exact: no.")).toBeInTheDocument();
    expect(panel).toHaveTextContent("38 of 40 cells match.");
    const table = within(panel).getByRole("table", { name: "Cells that differ" });
    expect(within(table).getAllByRole("columnheader").map((th) => th.textContent)).toEqual(["Row", "Column", "Marg's file", "Ours"]);
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows[0]).toHaveTextContent("2EXPIRY31-03-202801-03-2028");
    expect(rows[1]).toHaveTextContent("3FREE0(empty)");
  });

  it("says when a check is exact, and lists what to map or correct when the bills could not be compared", async () => {
    let answer: unknown = { version_no: 2, bills: 2, exact: true, rows_expected: 4, rows_produced: 4, cells: 40, equal: 40, diffs: [], tasks: null };
    serve((path, init) => (path.endsWith("/check") ? answer : base(path, init)));
    render(<MargProfilePage />);
    const list = await screen.findByRole("list", { name: "Marg profiles" });
    await userEvent.click(within(within(list).getAllByRole("article")[0]).getByRole("button", { name: "Check against a file Marg accepted" }));
    const panel = await screen.findByRole("region", { name: /Check ‘Shah Medicals’/ });
    await userEvent.upload(within(panel).getByLabelText(/The import file Marg accepted/), new File(["x"], "a.csv"));
    await userEvent.type(within(panel).getByLabelText(/The bills in that file/), "d1, d2");
    await userEvent.click(within(panel).getByRole("button", { name: "Check" }));
    expect(await within(panel).findByText("Exact: yes.")).toBeInTheDocument();
    expect(panel).toHaveTextContent("40 of 40 cells match.");
    expect(within(panel).queryByRole("table")).toBeNull();

    answer = {
      version_no: 2, bills: 2, exact: false, rows_expected: null, rows_produced: null, cells: null, equal: null, diffs: [],
      tasks: { suppliers: [], items: [], problems: [{ document_id: "d2", filename: "abc-17.pdf", line: 4, problem: "Line 4 has no batch number." }] },
    };  // prettier-ignore
    await userEvent.click(within(panel).getByRole("button", { name: "Check" }));
    expect(await within(panel).findByText("Not compared.")).toBeInTheDocument();
    expect(within(panel).getByRole("link", { name: "abc-17.pdf" })).toHaveAttribute("href", "/documents/d2");
    expect(within(panel).getByRole("list", { name: "What to correct on abc-17.pdf" })).toHaveTextContent("Line 4: Line 4 has no batch number.");
    expect(within(panel).getByRole("button", { name: "Check again" })).toBeInTheDocument();
  });
});
