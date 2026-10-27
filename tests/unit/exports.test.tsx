import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({
  api,
  apiUrl: (path: string) => `/api/v1${path}`,
  errorFrom: (status: number, body: { detail?: string } | null) => Object.assign(new Error(body?.detail ?? "x"), { status, detail: body?.detail ?? "x" }),
  ApiError: class extends Error {
    constructor(
      readonly status: number,
      readonly detail: string,
      readonly retryAfter: number | null = null,
      readonly fields: string[] = [],
      readonly existingId: string | null = null,
    ) {
      super(detail);
    }
  },
}));

import { Exports } from "@/components/exports/Exports";
import { ApiError } from "@/lib/api";
import type { ExportRun } from "@/lib/exports";
import type { Tasks } from "@/lib/mappings";

const NOW = new Date("2026-10-27T06:00:00Z");

const run = (overrides: Partial<ExportRun> = {}): ExportRun => ({
  id: "r1", target: "tally", from: "2026-10-01", to: "2026-10-27", status: "ready", invoices: 12, lines: 48, tasks: null,
  file: { filename: "docforge-tally-2026-10-01-2026-10-27.csv", sha256: "a".repeat(64), size_bytes: 2048 }, created_by: "Asha",
  created_at: "2026-10-27T06:00:00Z", ...overrides,
});  // prettier-ignore

const tasks: Tasks = {
  suppliers: [
    {
      seller_gstin: "24AABFN7754K1Z0", printed_names: ["ABC PHARMA PVT LTD"], bills: 4, mapping_id: null,
      suggestions: [
        { name: "ABC Pharma", gstin: "24AABFN7754K1Z0", source: "master", score: 1, why: "same GSTIN" },
        { name: "ABC Pharmaceuticals", gstin: null, source: "master", score: 0.8, why: "similar name" },
      ],
    },
  ],
  items: [
    { item_key: "k1", product_name: "Cefixime 200 Tab", pack: "10x10", printed_hsn: "3004", bills: 2, mapping_id: "i7", suggestions: [{ name: "CEFIX 200", gstin: null, source: "mapping", score: 0.9, why: "similar name" }] },
  ],
  problems: [{ document_id: "d5", filename: "scan-0005.pdf", problem: "The bill has no seller GSTIN. Correct it on the bill." }],
};  // prettier-ignore
const blocked = run({ id: "r2", status: "needs_mapping", file: null, tasks: { ...tasks, suppliers: tasks.suppliers.map((s) => ({ ...s, suggestions: [] })), items: tasks.items.map((i) => ({ ...i, suggestions: [] })) } });

type Handler = (path: string, init?: { method?: string; json?: unknown }) => unknown;
function serve(handler: Handler) {
  api.mockImplementation((path: string, init?: { method?: string; json?: unknown }) => {
    try {
      return Promise.resolve(handler(path, init));
    } catch (error) {
      return Promise.reject(error);
    }
  });
}
const calls = (method: string) => api.mock.calls.filter(([, init]) => (init?.method ?? "GET") === method);

beforeEach(() => {
  api.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe("exporting to Tally or Marg (V2 P1)", () => {
  it("runs this month so far for Tally by default, and offers the file when everything is mapped", async () => {
    serve((path, init) => (init?.method === "POST" ? run() : path === "/exports/runs" ? [] : null));
    render(<Exports mayMap now={NOW} />);
    expect(await screen.findByText(/No exports yet/)).toBeInTheDocument();
    expect(screen.getByLabelText("From")).toHaveValue("2026-10-01");
    expect(screen.getByLabelText("To")).toHaveValue("2026-10-27");

    await userEvent.click(screen.getByRole("button", { name: "Run export" }));
    expect(api).toHaveBeenCalledWith("/exports/runs", { method: "POST", json: { target: "tally", from: "2026-10-01", to: "2026-10-27" } });
    const result = await screen.findByRole("region", { name: "This export" });
    expect(result).toHaveTextContent("12 invoices, 48 lines.");

    const fetchSpy = vi.fn<typeof fetch>().mockResolvedValue(new Response("a,b\n", { status: 200, headers: { "content-disposition": 'attachment; filename="t.csv"' } }));
    vi.stubGlobal("fetch", fetchSpy);
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:x"), revokeObjectURL: vi.fn() }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    await userEvent.click(within(result).getByRole("button", { name: "Download the file" }));
    expect(fetchSpy.mock.calls[0][0]).toBe("/api/v1/exports/runs/r1/file");
    await waitFor(() => expect(click).toHaveBeenCalled());
    click.mockRestore();
  });

  it("sends Marg and the dates chosen, and shows the API's sentence for a range it refuses", async () => {
    serve((path, init) => {
      if (init?.method === "POST") throw new ApiError(422, "The range can be at most 366 days.");
      return [];
    });
    render(<Exports mayMap now={NOW} />);
    await userEvent.click(screen.getByRole("radio", { name: "Marg" }));
    await userEvent.clear(screen.getByLabelText("From"));
    await userEvent.type(screen.getByLabelText("From"), "2025-01-01");
    await userEvent.click(screen.getByRole("button", { name: "Run export" }));
    expect(api).toHaveBeenCalledWith("/exports/runs", { method: "POST", json: { target: "marg", from: "2025-01-01", to: "2026-10-27" } });
    expect(await screen.findByRole("alert")).toHaveTextContent("The range can be at most 366 days.");
  });

  it("stops with the task list when names are missing; a suggestion fills the name but saves nothing until confirmed", async () => {
    serve((path, init) => {
      if (init?.method === "POST" && path === "/exports/runs") return blocked;
      if (init?.method === "POST" || init?.method === "PATCH") return {};
      if (path.startsWith("/settings/mappings/suggestions")) return tasks;
      return [];
    });
    render(<Exports mayMap now={NOW} />);
    await userEvent.click(screen.getByRole("button", { name: "Run export" }));

    const result = await screen.findByRole("region", { name: "This export" });
    expect(result).toHaveTextContent("1 supplier and 1 item need mapping before this export can be made. No file was made.");
    expect(within(result).queryByRole("button", { name: "Download the file" })).toBeNull();
    expect(api).toHaveBeenCalledWith("/settings/mappings/suggestions?export_run_id=r2");

    const supplierTask = await within(result).findByRole("group", { name: /ABC PHARMA PVT LTD/ });
    expect(supplierTask).toHaveTextContent("24AABFN7754K1Z0");
    expect(supplierTask).toHaveTextContent("on 4 bills");
    await userEvent.click(within(supplierTask).getByRole("button", { name: "Use ‘ABC Pharma’ – same GSTIN" }));
    expect(within(supplierTask).getByLabelText("Tally ledger")).toHaveValue("ABC Pharma");
    expect(calls("POST")).toHaveLength(1); // only the run itself

    await userEvent.click(within(supplierTask).getByRole("button", { name: "Confirm mapping" }));
    expect(api).toHaveBeenCalledWith("/settings/mappings/suppliers", {
      method: "POST",
      json: { seller_gstin: "24AABFN7754K1Z0", printed_name: "ABC PHARMA PVT LTD", tally_ledger: "ABC Pharma", source: "suggestion" },
    });
    expect(await within(supplierTask).findByText("Mapped to ‘ABC Pharma’.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Run export again" })).toBeNull();

    // The item already has a mapping without a Tally name: that mapping is changed, with a typed name.
    const itemTask = within(result).getByRole("group", { name: /Cefixime 200 Tab/ });
    expect(itemTask).toHaveTextContent("Pack 10x10");
    expect(itemTask).toHaveTextContent("HSN 3004");
    await userEvent.click(within(itemTask).getByRole("button", { name: "Use ‘CEFIX 200’ – similar name" }));
    await userEvent.type(within(itemTask).getByLabelText("Tally stock item"), " TAB");
    await userEvent.click(within(itemTask).getByRole("button", { name: "Confirm mapping" }));
    expect(api).toHaveBeenCalledWith("/settings/mappings/items/i7", { method: "PATCH", json: { tally_item: "CEFIX 200 TAB" } });
    await within(itemTask).findByText("Mapped to ‘CEFIX 200 TAB’.");

    // The bill to correct is linked.
    expect(within(result).getByRole("link", { name: "scan-0005.pdf" })).toHaveAttribute("href", "/documents/d5");
    expect(result).toHaveTextContent("The bill has no seller GSTIN. Correct it on the bill.");

    serve((path, init) => (init?.method === "POST" ? run({ id: "r3" }) : path === "/exports/runs" ? [run({ id: "r3" }), blocked] : tasks));
    await userEvent.click(screen.getByRole("button", { name: "Run export again" }));
    expect(calls("POST").at(-1)).toEqual(["/exports/runs", { method: "POST", json: { target: "tally", from: "2026-10-01", to: "2026-10-27" } }]);
    expect(await screen.findByRole("region", { name: "This export" })).toHaveTextContent("12 invoices, 48 lines.");
  });

  it("shows the API's sentence when a confirm is refused, and keeps the task open", async () => {
    serve((path, init) => {
      if (init?.method === "POST" && path === "/exports/runs") return blocked;
      if (init?.method === "POST") throw new ApiError(409, "24AABFN7754K1Z0 is already mapped to Tally ledger 'ABC', by Asha. Change that mapping instead.", null, [], "s9");
      if (path.startsWith("/settings/mappings/suggestions")) return tasks;
      return [];
    });
    render(<Exports mayMap now={NOW} />);
    await userEvent.click(screen.getByRole("button", { name: "Run export" }));
    const supplierTask = await screen.findByRole("group", { name: /ABC PHARMA PVT LTD/ });
    await userEvent.type(within(supplierTask).getByLabelText("Tally ledger"), "ABC");
    await userEvent.click(within(supplierTask).getByRole("button", { name: "Confirm mapping" }));
    expect(api).toHaveBeenLastCalledWith("/settings/mappings/suppliers", expect.objectContaining({ json: expect.objectContaining({ source: "typed" }) }));
    expect(await within(supplierTask).findByRole("alert")).toHaveTextContent("already mapped to Tally ledger 'ABC'");
    expect(within(supplierTask).getByRole("button", { name: "Confirm mapping" })).toBeInTheDocument();
  });

  it("needs a name before confirming", async () => {
    serve((path, init) => (init?.method === "POST" ? blocked : path.startsWith("/settings/mappings/suggestions") ? tasks : []));
    render(<Exports mayMap now={NOW} />);
    await userEvent.click(screen.getByRole("button", { name: "Run export" }));
    const supplierTask = await screen.findByRole("group", { name: /ABC PHARMA PVT LTD/ });
    await userEvent.click(within(supplierTask).getByRole("button", { name: "Confirm mapping" }));
    expect(within(supplierTask).getByRole("alert")).toHaveTextContent("Type the name your books use, or choose a suggestion.");
    expect(calls("POST")).toHaveLength(1);
  });

  it("shows a reader the tasks and suggestions but nothing to confirm", async () => {
    serve((path, init) => (init?.method === "POST" ? blocked : path.startsWith("/settings/mappings/suggestions") ? tasks : []));
    render(<Exports mayMap={false} now={NOW} />);
    await userEvent.click(screen.getByRole("button", { name: "Run export" }));
    const supplierTask = await screen.findByRole("group", { name: /ABC PHARMA PVT LTD/ });
    expect(supplierTask).toHaveTextContent("ABC Pharma");
    expect(within(supplierTask).queryByRole("button", { name: "Confirm mapping" })).toBeNull();
    expect(within(supplierTask).queryByRole("textbox")).toBeNull();
    expect(screen.getByText(/Someone who reviews bills can map these/)).toBeInTheDocument();
  });

  it("lists past runs newest first, with a download for the ready ones", async () => {
    serve(() => [run({ id: "r9", target: "marg" }), blocked]);
    render(<Exports mayMap now={NOW} />);
    const table = await screen.findByRole("table", { name: "Past exports" });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows[0]).toHaveTextContent("Marg");
    expect(rows[0]).toHaveTextContent("Ready");
    expect(within(rows[0]).getByRole("button", { name: /Download/ })).toBeInTheDocument();
    expect(rows[1]).toHaveTextContent("Needs mapping");
    expect(within(rows[1]).queryByRole("button", { name: /Download/ })).toBeNull();
  });
});
