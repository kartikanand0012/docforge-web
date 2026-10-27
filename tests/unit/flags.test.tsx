import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ usePathname: () => "/documents/d1", useRouter: () => ({ push: vi.fn() }) }));
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

import { FlagStrip } from "@/components/document/FlagStrip";
import { QueueFlagBadges } from "@/components/FlagBadges";
import { FlagsCard } from "@/components/FlagsCard";
import { ApiError } from "@/lib/api";
import { nearExpirySentence, queueBadges } from "@/lib/flags";
import type { Review } from "@/lib/review";

// A block, not an arrow's value: a function returned from beforeEach is run after the test.
beforeEach(() => {
  api.mockReset();
});

function review(overrides: Partial<Review> = {}): Review {
  return {
    document_id: "d1", doc_type: "invoice", filename: "bill.pdf", version_no: 1, page_count: 1,
    pages: [{ number: 1, width: 595, height: 842 }], decision: "accept", blockers: [], record: {},
    assessment: { decision: "accept", reasons: [], fields: [], rules: [], issues: [] },
    editable_paths: [], corrections: [], match_status: "no_counterpart", discrepancies: [], counterpart_document_id: null,
    review: null, signature_valid: null, record_sha256: "a".repeat(64), meanings: {}, superseded: false, certificates: [],
    near_expiry_months: 6, duplicates: [], near_expiry: [], schedule_h1: [], ...overrides,
  };  // prettier-ignore
}

const near = (index: number, batch: string | null, product: string | null, months: number, expiry = "2027-01") => ({
  path: `lines[${index}]`, product_name: product, batch_no: batch, expiry, months_left: months,
});  // prettier-ignore
const h1 = (index: number) => ({ path: `lines[${index}]`, product_name: `Product ${index}`, molecule: "Levofloxacin", notification: null, product_id: null, joins_on: null });

describe("flags on a queue row (V2 P0)", () => {
  it("names each flag in words, with a count past one, the duplicate as a blocker", () => {
    expect(queueBadges({ duplicates: 1, near_expiry_lines: 3, schedule_h1_lines: 1 })).toEqual([
      { kind: "fail", text: "Possible duplicate" },
      { kind: "warn", text: "Near-expiry stock · 3 lines" },
      { kind: "info", text: "Schedule H1" },
    ]);
    expect(queueBadges({ duplicates: 2, near_expiry_lines: 1, schedule_h1_lines: 2 })).toEqual([
      { kind: "fail", text: "Possible duplicate · 2 earlier bills" },
      { kind: "warn", text: "Near-expiry stock" },
      { kind: "info", text: "Schedule H1 · 2 lines" },
    ]);
  });

  it("shows only the flags that were raised, and nothing from an older API", () => {
    expect(queueBadges({ duplicates: 0, near_expiry_lines: 2, schedule_h1_lines: 0 })).toEqual([{ kind: "warn", text: "Near-expiry stock · 2 lines" }]);
    expect(queueBadges(undefined)).toEqual([]);
    expect(queueBadges({ near_expiry_lines: 1 } as never)).toEqual([{ kind: "warn", text: "Near-expiry stock" }]);
  });

  it("renders them as badges with words, not colour alone", () => {
    const { container, unmount } = render(<QueueFlagBadges flags={{ duplicates: 1, near_expiry_lines: 3, schedule_h1_lines: 2 }} />);
    const list = screen.getByRole("list", { name: "Flags on this bill" });
    expect(within(list).getAllByRole("listitem").map((item) => item.textContent)).toEqual(["Possible duplicate", "Near-expiry stock · 3 lines", "Schedule H1 · 2 lines"]);
    expect(container.querySelector(".badge-fail")).toHaveTextContent("Possible duplicate");
    expect(container.querySelector(".badge-warn")).toHaveTextContent("Near-expiry stock · 3 lines");
    expect(container.querySelector(".badge-info")).toHaveTextContent("Schedule H1 · 2 lines");
    unmount();

    const none = render(<QueueFlagBadges flags={{ duplicates: 0, near_expiry_lines: 0, schedule_h1_lines: 0 }} />);
    expect(none.container).toBeEmptyDOMElement();
  });
});

describe("what was flagged on the bill (V2 P0)", () => {
  it("says a near-expiry line in one sentence, from the bill date, singular and plural", () => {
    expect(nearExpirySentence(near(0, "B221", "Paracetamol 500", 3), 6)).toBe("Batch B221 expires 2027-01, 3 months after the bill date (your window is 6 months).");
    expect(nearExpirySentence(near(0, "B221", "Paracetamol 500", 1), 1)).toBe("Batch B221 expires 2027-01, 1 month after the bill date (your window is 1 month).");
    expect(nearExpirySentence(near(0, null, "Paracetamol 500", 2), 6)).toBe("Paracetamol 500 expires 2027-01, 2 months after the bill date (your window is 6 months).");
    expect(nearExpirySentence(near(2, null, null, 0, "2026-10"), 6)).toBe("Line 3 expires 2026-10, the same month as the bill (your window is 6 months).");
    expect(nearExpirySentence(near(0, "B221", null, 4), undefined)).toBe("Batch B221 expires 2027-01, 4 months after the bill date.");
  });

  it("says a duplicate by seller and number, links the earlier bill, and that approving needs a reason", () => {
    render(<FlagStrip review={review({ duplicates: [{ document_id: "d0", filename: "INV-2041.pdf", matched_on: "seller_and_number" }] })} />);

    const strip = screen.getByRole("region", { name: "Flagged on this bill" });
    expect(strip).toHaveTextContent(
      "Possible duplicate: This bill may be a duplicate of INV-2041.pdf: same seller GSTIN and invoice number. Approving it needs a reason.",
    );
    expect(within(strip).getByRole("link", { name: "INV-2041.pdf" })).toHaveAttribute("href", "/documents/d0");
  });

  it("says a duplicate by IRN", () => {
    render(<FlagStrip review={review({ duplicates: [{ document_id: "d0", filename: "INV-2041.pdf", matched_on: "irn" }] })} />);

    expect(screen.getByRole("region", { name: "Flagged on this bill" })).toHaveTextContent("This bill may be a duplicate of INV-2041.pdf: same IRN.");
  });

  it("lists near-expiry lines, the first few and how many more, as information that needs no override", () => {
    const lines = [near(0, "B1", "A", 1), near(1, "B2", "B", 2), near(2, null, "Cetirizine 10", 3), near(3, "B4", "D", 4), near(4, "B5", "E", 5)];
    render(<FlagStrip review={review({ near_expiry: lines })} />);

    const strip = screen.getByRole("region", { name: "Flagged on this bill" });
    expect(strip).toHaveTextContent("Near expiry: Batch B1 expires 2027-01, 1 month after the bill date (your window is 6 months).");
    expect(strip).toHaveTextContent("Near expiry: Cetirizine 10 expires 2027-01, 3 months after the bill date (your window is 6 months).");
    expect(strip).not.toHaveTextContent("Batch B4");
    expect(strip).toHaveTextContent("And 2 more near-expiry lines.");
    expect(strip).toHaveTextContent("For your information: near-expiry stock needs no override; approve as usual.");
  });

  it("says how many lines are Schedule H1, for the register", () => {
    render(<FlagStrip review={review({ schedule_h1: [h1(0), h1(1)] })} />);

    const strip = screen.getByRole("region", { name: "Flagged on this bill" });
    expect(strip).toHaveTextContent("Schedule H1: 2 Schedule H1 lines: enter them in the H1 register.");
    expect(strip).toHaveTextContent("For your information: Schedule H1 needs no override; approve as usual.");
  });

  it("is not there when nothing was flagged, or the API is older", () => {
    const { container, unmount } = render(<FlagStrip review={review()} />);
    expect(container).toBeEmptyDOMElement();
    unmount();

    const older = review();
    delete older.duplicates;
    delete older.near_expiry;
    delete older.schedule_h1;
    const again = render(<FlagStrip review={older} />);
    expect(again.container).toBeEmptyDOMElement();
  });
});

describe("caught on your bills (V2 P0)", () => {
  const summary = {
    from: "2026-09-28", to: "2026-10-27", invoices: 48, duplicates: 2, near_expiry_lines: 3, near_expiry_bills: 2,
    schedule_h1_lines: 1, schedule_h1_bills: 1, capped: false,
  };  // prettier-ignore

  it("counts the last 30 days by default, in a sentence an owner can repeat", async () => {
    api.mockResolvedValue(summary);
    render(<FlagsCard />);

    const card = await screen.findByRole("region", { name: "Caught on your bills" });
    expect(api).toHaveBeenCalledWith("/flags/summary");
    expect(card).toHaveTextContent("On 48 invoices received 28 Sept 2026 to 27 Oct 2026, DocForge caught 2 possible duplicates, 3 near-expiry lines and 1 Schedule H1 line.");
    expect(within(card).getByText("3 near-expiry lines").closest("li")).toHaveTextContent("on 2 bills");
  });

  it("says 'at least' when there were more invoices than it counted", async () => {
    api.mockResolvedValue({ ...summary, invoices: 10000, capped: true });
    render(<FlagsCard />);

    const card = await screen.findByRole("region", { name: "Caught on your bills" });
    expect(card).toHaveTextContent("DocForge caught at least 2 possible duplicates, 3 near-expiry lines and 1 Schedule H1 line.");
    expect(card).toHaveTextContent("There were more invoices in this range than one summary counts (10,000), so the real numbers may be higher.");
  });

  it("asks for another range, and shows the API's sentence when it is refused", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-27T20:00:00Z")); // 28 Oct in India
    api.mockResolvedValueOnce(summary).mockRejectedValueOnce(new ApiError(422, "That range is too long: choose 366 days or fewer."));
    render(<FlagsCard />);
    await screen.findByRole("region", { name: "Caught on your bills" });

    await userEvent.click(screen.getByRole("radio", { name: "90 days" }));

    expect(api).toHaveBeenLastCalledWith("/flags/summary?from=2026-07-31&to=2026-10-28");
    expect(await screen.findByText("That range is too long: choose 366 days or fewer.")).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("shows nothing for an API without the summary", async () => {
    api.mockRejectedValue(new ApiError(404, "Not found."));
    const { container } = render(<FlagsCard />);
    await vi.waitFor(() => {
      expect(api).toHaveBeenCalled();
    });
    await new Promise((resolve) => setTimeout(resolve, 0)); // the refusal has arrived
    expect(container).toBeEmptyDOMElement();
  });
});
