import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/documents/d1", useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/api", () => ({ api: vi.fn(() => new Promise(() => undefined)), ApiError: class extends Error {} }));

import { ValuesTab } from "@/components/document/ValuesTab";
import { buildFields, type Review } from "@/lib/review";

const field = (raw: string, value: unknown = raw) => ({ value, raw, block_ids: ["b1"] });
const line = (name: string, expiry: string) => ({ product_name: field(name), batch_no: field("B1"), expiry: field(expiry), qty: field("10", 10) });
const shelf = (index: number) => ({
  rule_id: "line.shelf_life", version: 2, severity: "warning", outcome: "failed", paths: [`lines[${index}].expiry`],
  message: "Stock expires 2027-01, 4 months after the bill date; this workspace flags stock with less than 6 months left.",
});  // prettier-ignore

function review(overrides: Partial<Review> = {}): Review {
  return {
    document_id: "d1", doc_type: "invoice", filename: "bill.pdf", version_no: 1, page_count: 1,
    pages: [{ number: 1, width: 595, height: 842 }], decision: "accept", blockers: [],
    record: { lines: [line("Paracetamol 500", "01/27"), line("Cetirizine 10", "06/29")] },
    assessment: { decision: "accept", reasons: [], fields: [], rules: [shelf(0)], issues: [] },
    editable_paths: ["lines[0].product_name", "lines[0].expiry", "lines[1].product_name"], corrections: [], match_status: "no_counterpart", discrepancies: [], counterpart_document_id: null,
    review: null, signature_valid: null, record_sha256: "a".repeat(64), meanings: {}, superseded: false, certificates: [],
    near_expiry_months: 6, ...overrides,
  };  // prettier-ignore
}

function show(r: Review) {
  const noop = () => undefined;
  return render(
    <ValuesTab
      review={r} fields={buildFields(r)} filter="all" onFilter={noop} activePath={null} hoveredPath={null} onHover={noop}
      onActivate={noop} editingPath={null} onEdit={noop} onCorrected={noop} onBlockerTab={noop} callerEmail={null}
    />,
  );  // prettier-ignore
}

describe("near-expiry stock on the bill (V2 3.4)", () => {
  it("sums it up above the values, as a note and not as something to approve", () => {
    show(review());

    const notes = screen.getByRole("region", { name: "About the stock" });
    expect(notes).toHaveTextContent("Near expiry: 1 line expires within 6 months of the bill.");
    expect(screen.queryByRole("region", { name: "What needs a person" })).toBeNull();
  });

  it("shows each line's expiry, the near one in amber", () => {
    show(review());

    const table = screen.getByRole("table");
    expect(within(table).getByRole("columnheader", { name: "Expiry" })).toBeInTheDocument();
    expect(within(table).getByText("01/27")).toHaveClass("flag-text");
    expect(within(table).getByText("06/29")).not.toHaveClass("flag-text");
  });

  it("says nothing when no line is near expiry or the window is off", () => {
    const { unmount } = show(review({ assessment: { decision: "accept", reasons: [], fields: [], rules: [], issues: [] } }));
    expect(screen.queryByRole("region", { name: "About the stock" })).toBeNull();
    unmount();

    show(review({ near_expiry_months: 0 }));
    expect(screen.queryByRole("region", { name: "About the stock" })).toBeNull();
  });

  it("leaves out the Expiry column where lines print none (a purchase order)", () => {
    const order = { lines: [{ product_name: field("Paracetamol 500"), qty: field("10", 10) }] };
    show(review({ doc_type: "purchase_order", record: order, assessment: { decision: "accept", reasons: [], fields: [], rules: [], issues: [] } }));

    expect(screen.queryByRole("columnheader", { name: "Expiry" })).toBeNull();
    expect(screen.queryByRole("region", { name: "About the stock" })).toBeNull();
  });
});
