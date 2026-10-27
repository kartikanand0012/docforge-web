import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({
  api,
  apiUrl: (path: string) => `/api/v1${path}`,
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

import { ImportMasters } from "@/components/mappings/ImportMasters";
import { MappingList } from "@/components/mappings/MappingList";
import { ApiError } from "@/lib/api";
import type { ItemMapping, SupplierMapping } from "@/lib/mappings";

const supplier = (id: string, overrides: Partial<SupplierMapping> = {}): SupplierMapping => ({
  id, seller_gstin: "24AABFN7754K1Z0", printed_name: "ABC Pharma Pvt Ltd", tally_ledger: "ABC Pharma", marg_party: null,
  purchase_ledger: "Purchase GST 12%", tax_treatment: null, source: "typed", created_by: "Asha", created_at: "2026-10-27T06:00:00Z",
  updated_by: null, updated_at: null, ...overrides,
});  // prettier-ignore
const item = (id: string, overrides: Partial<ItemMapping> = {}): ItemMapping => ({
  id, item_key: `k-${id}`, product_name: "Cefixime 200 Tab", pack: "10x10", printed_hsn: "3004", tally_item: "Cefix 200", marg_item: null,
  preferred_hsn: "30042019", source: "suggestion", created_by: "Ravi", created_at: "2026-10-26T06:00:00Z", updated_by: null, updated_at: null,
  ...overrides,
});  // prettier-ignore

beforeEach(() => {
  api.mockReset();
});

describe("the suppliers list (V2 P1)", () => {
  it("shows each mapping, who made it, the total, and loads more", async () => {
    api.mockResolvedValueOnce({ items: [supplier("s1"), supplier("s2", { seller_gstin: "27AAACZ1234F1Z5", printed_name: "Zenith", tally_ledger: null, marg_party: "ZENITH", updated_by: "Ravi", updated_at: "2026-10-28T06:00:00Z" })], total: 3, next_after: "c1" });
    api.mockResolvedValueOnce({ items: [supplier("s3", { seller_gstin: "29AAACZ1234F1Z5", printed_name: "Medisynth" })], total: 3, next_after: null });
    render(<MappingList kind="suppliers" mayChange={false} />);

    const rows = await screen.findAllByRole("listitem");
    expect(api).toHaveBeenCalledWith("/settings/mappings/suppliers?limit=50");
    expect(screen.getByText("3 suppliers mapped")).toBeInTheDocument();
    expect(rows[0]).toHaveTextContent("ABC Pharma Pvt Ltd");
    expect(rows[0]).toHaveTextContent("24AABFN7754K1Z0");
    expect(rows[0]).toHaveTextContent("Tally ledger: ABC Pharma");
    expect(rows[0]).toHaveTextContent("Purchase ledger: Purchase GST 12%");
    expect(rows[0]).toHaveTextContent("Created by Asha on 27 Oct 2026");
    expect(rows[1]).toHaveTextContent("Marg party: ZENITH");
    expect(rows[1]).toHaveTextContent("Changed by Ravi on 28 Oct 2026");

    await userEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(api).toHaveBeenLastCalledWith("/settings/mappings/suppliers?limit=50&after=c1");
    expect(await screen.findByText("Medisynth")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });

  it("searches when the search is sent", async () => {
    api.mockResolvedValue({ items: [], total: 0, next_after: null });
    render(<MappingList kind="suppliers" mayChange={false} />);
    await userEvent.type(await screen.findByLabelText("Search suppliers"), "abc{Enter}");
    expect(api).toHaveBeenLastCalledWith("/settings/mappings/suppliers?limit=50&q=abc");
    expect(await screen.findByText("No supplier matches “abc”.")).toBeInTheDocument();
  });

  it("says when nothing is mapped yet", async () => {
    api.mockResolvedValue({ items: [], total: 0, next_after: null });
    render(<MappingList kind="items" mayChange={false} />);
    expect(await screen.findByText(/No items mapped yet/)).toBeInTheDocument();
  });

  it("offers no add, edit or remove to a reader", async () => {
    api.mockResolvedValue({ items: [supplier("s1")], total: 1, next_after: null });
    render(<MappingList kind="suppliers" mayChange={false} />);
    await screen.findAllByRole("listitem");
    expect(screen.queryByRole("button", { name: /Add supplier/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Edit/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Remove/ })).toBeNull();
  });

  it("removes a mapping only after an in-page confirm that says past exports stay as they are", async () => {
    const confirmSpy = vi.spyOn(window, "confirm");
    api.mockResolvedValueOnce({ items: [supplier("s1"), supplier("s2", { printed_name: "Zenith" })], total: 2, next_after: null });
    render(<MappingList kind="suppliers" mayChange />);
    await screen.findAllByRole("listitem");

    await userEvent.click(screen.getByRole("button", { name: "Remove ABC Pharma Pvt Ltd" }));
    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveTextContent("Exports already made do not change.");
    expect(api).toHaveBeenCalledTimes(1);
    api.mockResolvedValueOnce(undefined);
    await userEvent.click(within(dialog).getByRole("button", { name: "Remove mapping" }));

    expect(api).toHaveBeenLastCalledWith("/settings/mappings/suppliers/s1", { method: "DELETE" });
    await waitFor(() => expect(screen.queryByText("ABC Pharma Pvt Ltd")).toBeNull());
    expect(screen.getByText("1 supplier mapped")).toBeInTheDocument();
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it("edits a mapping, sending only what changed, the GSTIN fixed", async () => {
    api.mockResolvedValueOnce({ items: [supplier("s1")], total: 1, next_after: null });
    render(<MappingList kind="suppliers" mayChange />);
    await screen.findAllByRole("listitem");
    await userEvent.click(screen.getByRole("button", { name: "Edit ABC Pharma Pvt Ltd" }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryByLabelText("Seller GSTIN")).toBeNull();
    expect(dialog).toHaveTextContent("24AABFN7754K1Z0");
    await userEvent.type(within(dialog).getByLabelText("Marg party"), "ABC PHARMA");
    await userEvent.clear(within(dialog).getByLabelText("Purchase ledger"));
    api.mockResolvedValueOnce(supplier("s1", { marg_party: "ABC PHARMA", purchase_ledger: null, updated_by: "Asha", updated_at: "2026-10-28T06:00:00Z" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));

    expect(api).toHaveBeenLastCalledWith("/settings/mappings/suppliers/s1", { method: "PATCH", json: { marg_party: "ABC PHARMA", purchase_ledger: null } });
    expect(await screen.findByText(/Marg party: ABC PHARMA/)).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("adds a supplier, needing a Tally or Marg name, and shows the API's sentence for one already mapped", async () => {
    api.mockResolvedValueOnce({ items: [], total: 0, next_after: null });
    render(<MappingList kind="suppliers" mayChange />);
    await userEvent.click(await screen.findByRole("button", { name: "Add supplier" }));
    await userEvent.type(screen.getByLabelText("Seller GSTIN"), "24AABFN7754K1Z0");
    await userEvent.type(screen.getByLabelText("Name printed on bills"), "ABC Pharma Pvt Ltd");
    await userEvent.click(screen.getByRole("button", { name: "Save mapping" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Give the name in Tally or in Marg, or both.");
    expect(api).toHaveBeenCalledTimes(1);

    await userEvent.type(screen.getByLabelText("Tally ledger"), "ABC Pharma");
    const detail = "24AABFN7754K1Z0 is already mapped to Tally ledger 'ABC Pharma', by Asha. Change that mapping instead.";
    api.mockRejectedValueOnce(new (ApiError as unknown as new (...args: unknown[]) => Error)(409, detail, null, [], "s9"));
    await userEvent.click(screen.getByRole("button", { name: "Save mapping" }));
    expect(api).toHaveBeenLastCalledWith("/settings/mappings/suppliers", {
      method: "POST",
      json: { seller_gstin: "24AABFN7754K1Z0", printed_name: "ABC Pharma Pvt Ltd", tally_ledger: "ABC Pharma", source: "typed" },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(detail);

    api.mockResolvedValueOnce({ items: [supplier("s9")], total: 1, next_after: null });
    await userEvent.click(screen.getByRole("button", { name: "Show that mapping" }));
    expect(api).toHaveBeenLastCalledWith("/settings/mappings/suppliers?limit=50&q=24AABFN7754K1Z0");
    expect(await screen.findByRole("listitem")).toHaveClass("mapping-row-found");
  });

  it("adds an item with its pack and HSNs", async () => {
    api.mockResolvedValueOnce({ items: [], total: 0, next_after: null });
    render(<MappingList kind="items" mayChange />);
    await userEvent.click(await screen.findByRole("button", { name: "Add item" }));
    await userEvent.type(screen.getByLabelText("Product name as printed"), "Cefixime 200 Tab");
    await userEvent.type(screen.getByLabelText("Pack"), "10x10");
    await userEvent.type(screen.getByLabelText("Marg item"), "CEFIX 200");
    await userEvent.type(screen.getByLabelText(/Preferred HSN/), "30042019");
    api.mockResolvedValueOnce(item("i1", { marg_item: "CEFIX 200", tally_item: null, source: "typed" }));
    await userEvent.click(screen.getByRole("button", { name: "Save mapping" }));
    expect(api).toHaveBeenLastCalledWith("/settings/mappings/items", {
      method: "POST",
      json: { product_name: "Cefixime 200 Tab", pack: "10x10", marg_item: "CEFIX 200", preferred_hsn: "30042019", source: "typed" },
    });
    const row = await screen.findByRole("listitem");
    expect(row).toHaveTextContent("Marg item: CEFIX 200");
    expect(screen.getByText("1 item mapped")).toBeInTheDocument();
  });

  it("shows an item's pack, printed HSN and preferred HSN", async () => {
    api.mockResolvedValueOnce({ items: [item("i1")], total: 1, next_after: null });
    render(<MappingList kind="items" mayChange={false} />);
    const row = await screen.findByRole("listitem");
    expect(row).toHaveTextContent("Cefixime 200 Tab");
    expect(row).toHaveTextContent("Pack 10x10");
    expect(row).toHaveTextContent("HSN 3004");
    expect(row).toHaveTextContent("Tally stock item: Cefix 200");
    expect(row).toHaveTextContent("Preferred HSN: 30042019");
    expect(row).toHaveTextContent("Confirmed from a suggestion by Ravi on 26 Oct 2026");
  });
});

describe("importing names from Tally or Marg (V2 P1)", () => {
  it("explains the file, and that the names are only suggestions", () => {
    render(<ImportMasters />);
    expect(screen.getByLabelText("Import names from Tally / Marg (CSV)")).toBeInTheDocument();
    expect(screen.getByText(/name, type/)).toBeInTheDocument();
    expect(screen.getByText(/only offered as suggestions/)).toBeInTheDocument();
  });

  it("sends the file and reports what was imported and each row that was not", async () => {
    api.mockResolvedValueOnce({
      rows: 1000, imported: 995, already_known: 0,
      rejected: [{ line: 4, reason: "type must be supplier or item" }, { line: 9, reason: "the GSTIN is not valid" }, ...[11, 12, 13].map((line) => ({ line, reason: "the name is empty" }))],
    });  // prettier-ignore
    render(<ImportMasters />);
    const file = new File(["name,type\n"], "tally-masters.csv", { type: "text/csv" });
    await userEvent.upload(screen.getByLabelText("Import names from Tally / Marg (CSV)"), file);

    expect(api).toHaveBeenCalledWith("/settings/mappings/import", { method: "POST", body: expect.any(FormData) });
    expect(((api.mock.calls[0][1] as { body: FormData }).body.get("file") as File).name).toBe("tally-masters.csv");
    expect(await screen.findByText("Imported 995 names; 0 already known; 5 rows not imported:")).toBeInTheDocument();
    const table = screen.getByRole("table");
    const cells = within(table).getAllByRole("row").slice(1).map((row) => row.textContent);
    expect(cells[0]).toBe("4type must be supplier or item");
    expect(cells).toHaveLength(5);
  });

  it("shows the API's sentence when the file cannot be read", async () => {
    api.mockRejectedValueOnce(new ApiError(422, "The file has no 'type' column."));
    render(<ImportMasters />);
    await userEvent.upload(screen.getByLabelText("Import names from Tally / Marg (CSV)"), new File(["x"], "x.csv", { type: "text/csv" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The file has no 'type' column.");
  });
});
