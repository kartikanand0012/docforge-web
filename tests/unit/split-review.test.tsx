import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => vi.fn());
const push = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({
  api,
  upload: vi.fn(),
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
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));

import { BatchView } from "@/components/batches/BatchView";
import { SplitBanner } from "@/components/split/SplitBanner";
import { SplitReview } from "@/components/split/SplitReview";
import type { Batch } from "@/lib/batches";
import type { Split } from "@/lib/split";

const REVIEW: Split = {
  document_id: "p1", filename: "october.pdf", status: "review", automatic: false,
  reason: "page 2 has no invoice number; it may continue invoice NVM/1 or be a separate page", page_count: 3,
  proposed: [
    { pages: [1, 2], invoice_no: "NVM/1", seller_gstin: "24AABFN7754K1Z0", document_id: null, document_status: null, new: false },
    { pages: [3], invoice_no: "SRP/2", seller_gstin: null, document_id: null, document_status: null, new: false },
  ],
  proposed_non_invoice: [], pages_in_doubt: [2], groups: [], non_invoice: [],
  counts: { pages: 3, invoices: 2, invoice_pages: 3, non_invoice_pages: 0 },
  decided_by: null, decided_person: null, decided_at: null, created_at: "2026-11-04T06:00:00Z",
};  // prettier-ignore

beforeEach(() => {
  api.mockReset();
  push.mockReset();
});

describe("Split Review", () => {
  it("shows the pages grouped as proposed, the doubt, and counts that add up", async () => {
    api.mockResolvedValue(REVIEW);
    render(<SplitReview documentId="p1" mayGroup />);

    expect(await screen.findByText(/not sure where the invoices divide/)).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Invoice 1" })).toHaveTextContent("pages 1–2");
    expect(screen.getByRole("region", { name: "Invoice 1" })).toHaveTextContent("No. NVM/1");
    expect(within(screen.getByRole("region", { name: "Invoice 1" })).getByText("Unsure")).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Pages placed" })).toHaveTextContent("3 pages = 3 in 2 invoices + 0 not an invoice pages ✓");
    expect(screen.getAllByRole("img")[0]).toHaveAttribute("src", "/api/v1/documents/p1/pages/1?size=thumbnail");
  });

  it("moves a page out as 'not an invoice page' and confirms that grouping", async () => {
    api.mockResolvedValueOnce(REVIEW).mockResolvedValueOnce({ ...REVIEW, status: "split" });
    const user = userEvent.setup();
    render(<SplitReview documentId="p1" mayGroup />);
    const first = await screen.findByRole("region", { name: "Invoice 1" });

    const pageTwo = within(first).getAllByRole("listitem")[1];
    await user.click(within(pageTwo).getByRole("button", { name: "Not an invoice page" }));

    expect(screen.getByRole("status", { name: "Pages placed" })).toHaveTextContent("3 pages = 2 in 2 invoices + 1 not an invoice page ✓");
    expect(screen.getByRole("region", { name: "Not an invoice page" })).toHaveTextContent("Page 2");
    await user.click(screen.getByRole("button", { name: "Confirm 2 invoices" }));
    expect(api).toHaveBeenLastCalledWith("/documents/p1/split", { method: "POST", json: { groups: [[1], [3]], non_invoice: [2] } });
    expect(push).toHaveBeenCalledWith("/documents/p1");
  });

  it("moves a page to the next invoice", async () => {
    api.mockResolvedValue(REVIEW);
    const user = userEvent.setup();
    render(<SplitReview documentId="p1" mayGroup />);
    const first = await screen.findByRole("region", { name: "Invoice 1" });

    await user.click(within(within(first).getAllByRole("listitem")[1]).getByRole("button", { name: "Next invoice →" }));

    expect(screen.getByRole("region", { name: "Invoice 1" })).toHaveTextContent("page 1");
    expect(screen.getByRole("region", { name: "Invoice 2" })).toHaveTextContent("pages 2–3");
  });

  it("shows the server's refusal in words", async () => {
    const { ApiError } = await import("@/lib/api");
    api.mockResolvedValueOnce(REVIEW).mockRejectedValueOnce(new ApiError(409, "The pages of this file were grouped already."));
    const user = userEvent.setup();
    render(<SplitReview documentId="p1" mayGroup />);

    await user.click(await screen.findByRole("button", { name: "Confirm 2 invoices" }));

    expect(await screen.findByText("The pages of this file were grouped already.")).toBeInTheDocument();
  });

  it("offers no moves to someone who does not review", async () => {
    api.mockResolvedValue(REVIEW);
    render(<SplitReview documentId="p1" mayGroup={false} />);

    await screen.findByRole("region", { name: "Invoice 1" });
    expect(screen.queryByRole("button", { name: /Confirm/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Not an invoice page" })).not.toBeInTheDocument();
  });
});

describe("the document's banner", () => {
  it("links a divided file to its invoices", async () => {
    api.mockResolvedValue({
      ...REVIEW, status: "split", non_invoice: [2], counts: { pages: 3, invoices: 2, invoice_pages: 2, non_invoice_pages: 1 },
      groups: [
        { pages: [1], invoice_no: null, seller_gstin: null, document_id: "c1", document_status: "extracted", new: true },
        { pages: [3], invoice_no: null, seller_gstin: null, document_id: "c2", document_status: "extracted", new: true },
      ],
    });  // prettier-ignore
    render(<SplitBanner document={{ id: "p1", status: "split" }} />);

    expect(await screen.findByText("Split into 2 invoices.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Invoice 2 (page 3)" })).toHaveAttribute("href", "/documents/c2");
  });

  it("sends a file waiting for grouping to Split Review, and an invoice back to its file", async () => {
    api.mockResolvedValue(REVIEW);
    const { unmount } = render(<SplitBanner document={{ id: "p1", status: "split_review" }} />);
    expect(await screen.findByRole("link", { name: "Group its pages" })).toHaveAttribute("href", "/splits/p1");
    unmount();

    render(<SplitBanner document={{ id: "c1", status: "extracted", parent_document_id: "p1", parent_pages: [3, 4] }} />);
    expect(screen.getByText(/pages 3–4 of a file that held several/)).toBeInTheDocument();
  });
});

const BATCH: Batch = {
  id: "b1", kind: "zip", name: "week-44.zip", doc_type: "invoice", expected: 3, person: "Asha", created_at: "2026-11-04T06:00:00Z",
  counts: { total: 3, not_sent: 0, received: 2, already_received: 0, refused: 1, waiting: 0, processed: 3, ready: 1, split: 0, failed: 2 },
  items: [
    { id: "i1", position: 0, filename: "a.pdf", size_bytes: 10, outcome: "received", reason: null, document_id: "d1", state: "ready", error: null },
    { id: "i2", position: 1, filename: "b.pdf", size_bytes: 10, outcome: "received", reason: null, document_id: "d2", state: "failed", error: "The model provider failed." },
    { id: "i3", position: 2, filename: "broken.pdf", size_bytes: 10, outcome: "refused", reason: "The file could not be read as a PDF.", document_id: null, state: "refused", error: null },
  ],
};  // prettier-ignore

describe("the batch view", () => {
  it("counts the files and names each one's outcome", async () => {
    api.mockResolvedValue(BATCH);
    render(<BatchView id="b1" mayRetry />);

    const tiles = await screen.findByRole("group", { name: "Batch counts" });
    expect(tiles).toHaveTextContent("Files3");
    expect(tiles).toHaveTextContent("Ready1");
    expect(tiles).toHaveTextContent("Failed2");
    expect(screen.getByText("The file could not be read as a PDF.")).toBeInTheDocument();
    expect(screen.getByText("The model provider failed.")).toBeInTheDocument();
  });

  it("retries only the files whose reading failed", async () => {
    api.mockResolvedValueOnce(BATCH).mockResolvedValueOnce({ ...BATCH, counts: { ...BATCH.counts, waiting: 1, processed: 2, failed: 1 } });
    const user = userEvent.setup();
    render(<BatchView id="b1" mayRetry />);

    await user.click(await screen.findByRole("button", { name: "Read the 1 failed file again" }));

    expect(api).toHaveBeenLastCalledWith("/batches/b1/retry", { method: "POST" });
  });

  it("offers no retry to someone who cannot upload", async () => {
    api.mockResolvedValue(BATCH);
    render(<BatchView id="b1" mayRetry={false} />);

    await screen.findByRole("group", { name: "Batch counts" });
    expect(screen.queryByRole("button", { name: /again/ })).not.toBeInTheDocument();
  });
});
