import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({
  api,
  ApiError: class extends Error {
    constructor(
      readonly status: number,
      readonly detail: string,
    ) {
      super(detail);
    }
  },
}));

import { OrderTab } from "@/components/document/DocumentTabs";
import { ApiError } from "@/lib/api";
import type { Review } from "@/lib/review";

function review(overrides: Partial<Review> = {}): Review {
  return {
    document_id: "d1", doc_type: "invoice", filename: "bill.pdf", version_no: 1, page_count: 1,
    pages: [{ number: 1, width: 595, height: 842 }], decision: "review", blockers: ["there is no purchase order on file to compare it with"], record: {},
    assessment: { decision: "review", reasons: [], fields: [], rules: [], issues: [] },
    editable_paths: [], corrections: [], match_status: "no_counterpart", discrepancies: [], counterpart_document_id: null,
    review: null, signature_valid: null, record_sha256: "a".repeat(64), meanings: {}, superseded: false, certificates: [], ...overrides,
  };  // prettier-ignore
}

const candidates = [
  { document_id: "o3", filename: "PO-other.pdf", po_no: "PO-77", supplier_name: "Zenith Pharma", created_at: "2026-10-20T06:00:00Z", same_supplier: false },
  { document_id: "o2", filename: "PO-ms.pdf", po_no: "PO-1042", supplier_name: "Medisynth Pharma", created_at: "2026-10-18T06:00:00Z", same_supplier: true },
  { document_id: "o1", filename: "scan-0001.pdf", po_no: null, supplier_name: null, created_at: "2026-10-01T06:00:00Z", same_supplier: false },
];

beforeEach(() => {
  api.mockReset();
  api.mockImplementation((path: string) => Promise.resolve(path.endsWith("/order-candidates") ? candidates : {}));
});

describe("linking an invoice to its order by hand (V2 P0)", () => {
  it("is offered to those who review when no order was found, and to no one else", () => {
    const { unmount } = render(<OrderTab review={review()} />);
    expect(screen.queryByRole("button", { name: /Link an order/ })).toBeNull();
    unmount();

    render(<OrderTab review={review()} mayLink onLinked={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Link an order…" })).toBeInTheDocument();
  });

  it("offers a different order when the bill does not match the one found", () => {
    render(<OrderTab review={review({ match_status: "mismatch", counterpart_document_id: "o9" })} mayLink onLinked={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Link a different order…" })).toBeInTheDocument();
  });

  it("lists the orders on file, the same supplier's first and marked", async () => {
    render(<OrderTab review={review()} mayLink onLinked={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Link an order…" }));

    const dialog = screen.getByRole("dialog", { name: "Link this invoice to its purchase order" });
    expect(api).toHaveBeenCalledWith("/documents/d1/order-candidates");
    const options = await within(dialog).findAllByRole("radio");
    expect(options.map((option) => option.closest("label")?.textContent)).toEqual([
      expect.stringContaining("Order PO-1042"),
      expect.stringContaining("Order PO-77"),
      expect.stringContaining("scan-0001.pdf"),
    ]);
    expect(options[0].closest("label")).toHaveTextContent("Same supplier");
    expect(options[0].closest("label")).toHaveClass("order-option-same");
    expect(options[1].closest("label")).not.toHaveTextContent("Same supplier");
  });

  it("needs an order and a reason before it sends anything", async () => {
    render(<OrderTab review={review()} mayLink onLinked={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Link an order…" }));
    await screen.findAllByRole("radio");

    await userEvent.click(screen.getByRole("button", { name: "Link order" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Choose the purchase order this invoice is for.");
    await userEvent.click(screen.getByRole("radio", { name: /PO-1042/ }));
    await userEvent.click(screen.getByRole("button", { name: "Link order" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Say why this is the right order.");
    expect(api).toHaveBeenCalledTimes(1);
  });

  it("shows the API's sentence when the link is refused", async () => {
    api.mockImplementation((path: string) =>
      path.endsWith("/order-candidates") ? Promise.resolve(candidates) : Promise.reject(new ApiError(409, "That order is already linked to another invoice.")),
    );
    const onLinked = vi.fn();
    render(<OrderTab review={review()} mayLink onLinked={onLinked} />);
    await userEvent.click(screen.getByRole("button", { name: "Link an order…" }));
    await userEvent.click(await screen.findByRole("radio", { name: /PO-1042/ }));
    await userEvent.type(screen.getByLabelText("Why this order? (required)"), "Supplier confirmed the PO by phone");
    await userEvent.click(screen.getByRole("button", { name: "Link order" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("That order is already linked to another invoice.");
    expect(onLinked).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("links it, then shows the bill as it now is with a message", async () => {
    const after = review({ match_status: "match", counterpart_document_id: "o2", blockers: [] });
    api.mockImplementation((path: string) => Promise.resolve(path.endsWith("/order-candidates") ? candidates : after));
    const onLinked = vi.fn();
    render(<OrderTab review={review()} mayLink onLinked={onLinked} />);
    await userEvent.click(screen.getByRole("button", { name: "Link an order…" }));
    await userEvent.click(await screen.findByRole("radio", { name: /PO-1042/ }));
    await userEvent.type(screen.getByLabelText("Why this order? (required)"), "  Supplier confirmed the PO by phone ");
    await userEvent.click(screen.getByRole("button", { name: "Link order" }));

    expect(api).toHaveBeenCalledWith("/documents/d1/order-link", { method: "POST", json: { order_document_id: "o2", reason: "Supplier confirmed the PO by phone" } });
    expect(onLinked).toHaveBeenCalledWith(after, "Linked to order PO-1042. Every line agrees with the order.");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("says so when there is no order on file to link", async () => {
    api.mockResolvedValue([]);
    render(<OrderTab review={review()} mayLink onLinked={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Link an order…" }));

    expect(await screen.findByText("No purchase orders on file yet. Upload the order first, then link it here.")).toBeInTheDocument();
  });
});
