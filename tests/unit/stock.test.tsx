import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/documents/d1", useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/api", () => ({ api: vi.fn(() => new Promise(() => undefined)), ApiError: class extends Error {} }));

import { ValuesTab } from "@/components/document/ValuesTab";
import { api } from "@/lib/api";
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

describe("Schedule H1 lines on the bill (V2 3.6)", () => {
  const levo = { path: "lines[0]", product_name: "Paracetamol 500", molecule: "Levofloxacin", notification: "G.S.R. 588(E), 30 August 2013", product_id: null, joins_on: null };
  const marked = { path: "lines[1]", product_name: "Cetirizine 10", molecule: null, notification: null, product_id: "p1", joins_on: null };

  it("sums them up as a note, and badges each line", () => {
    show(review({ schedule_h1: [levo, marked] }));

    expect(screen.getByRole("region", { name: "About the stock" })).toHaveTextContent("Schedule H1: 2 Schedule H1 lines: enter them in the H1 register.");
    const table = screen.getByRole("table");
    expect(within(table).getAllByText("Schedule H1")).toHaveLength(2);
    expect(within(table).getByText(/Levofloxacin is on Schedule H1/)).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "What needs a person" })).toBeNull();
  });

  it("says when a molecule joins the schedule", () => {
    show(review({ schedule_h1: [{ ...levo, molecule: "Pregabalin", joins_on: "2026-11-16" }] }));

    expect(screen.getByText("H1 soon")).toBeInTheDocument();
    expect(screen.getByText(/Pregabalin joins Schedule H1 on 16 Nov 2026/)).toBeInTheDocument();
  });

  it("offers marking only to those who review, and removing only a workspace's mark", () => {
    const { unmount } = show(review({ schedule_h1: [levo, marked] }));
    expect(screen.queryByRole("button", { name: /Schedule H1/ })).toBeNull();
    unmount();

    render(
      <ValuesTab
        review={review({ schedule_h1: [levo, marked] })} fields={buildFields(review())} filter="all" onFilter={() => undefined}
        activePath={null} hoveredPath={null} onHover={() => undefined} onActivate={() => undefined} editingPath={null}
        onEdit={() => undefined} onCorrected={() => undefined} onBlockerTab={() => undefined} callerEmail={null}
        mayMarkH1 onReviewChanged={() => undefined}
      />,
    );  // prettier-ignore
    // The schedule's molecule is the law's: no button on line 0; line 1's mark can go.
    expect(screen.queryByRole("button", { name: "Mark as Schedule H1: Paracetamol 500" })).toBeNull();
    expect(screen.getByRole("button", { name: "Remove the Schedule H1 mark from Cetirizine 10" })).toBeInTheDocument();
  });

  it("marks a line's product, then shows the bill as it now is", async () => {
    const after = review({ schedule_h1: [marked] });
    const calls = vi.mocked(api);
    calls.mockImplementation(((path: string) => Promise.resolve(path.endsWith("/review") ? after : {})) as typeof api);
    const changed = vi.fn();
    render(
      <ValuesTab
        review={review({ schedule_h1: [] })} fields={buildFields(review())} filter="all" onFilter={() => undefined}
        activePath={null} hoveredPath={null} onHover={() => undefined} onActivate={() => undefined} editingPath={null}
        onEdit={() => undefined} onCorrected={() => undefined} onBlockerTab={() => undefined} callerEmail={null}
        mayMarkH1 onReviewChanged={changed}
      />,
    );  // prettier-ignore

    await userEvent.click(screen.getByRole("button", { name: "Mark as Schedule H1: Cetirizine 10" }));

    expect(calls).toHaveBeenCalledWith("/schedule-h1/products", { method: "POST", json: { product_name: "Cetirizine 10" } });
    expect(calls).toHaveBeenCalledWith("/documents/d1/review");
    expect(changed).toHaveBeenCalledWith(after, "Cetirizine 10 is marked as Schedule H1 on every bill in this workspace.");
  });
});
