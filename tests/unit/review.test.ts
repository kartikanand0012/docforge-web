import { describe, expect, it } from "vitest";
import { blockerTarget, buildFields, groupOf, nearExpiryPaths, nearExpirySummary, type Review } from "@/lib/review";

const box = { page: 1, x0: 30, y0: 786.5, x1: 120, y1: 792.5 };

const review = {
  document_id: "d1",
  doc_type: "invoice",
  filename: "MS-INV-04417.pdf",
  version_no: 1,
  page_count: 1,
  pages: [{ number: 1, width: 595.28, height: 841.89 }],
  decision: "review",
  blockers: ["1 value was not found in the source text it cites", "1 check failed: totals.sum"],
  record: {
    invoice_no: { value: "MS/24-25/04417", raw: "MS/24-25/04417", block_ids: ["b2"] },
    seller: { name: { value: "Medisynth Pharma", raw: "Medisynth Pharma", block_ids: ["b9"] } },
    lines: [{ qty: { value: 1200, raw: "1,200", block_ids: ["b33"] } }],
    totals: { grand_total: { value: "412877.60", raw: "4,12,877.60", block_ids: ["b99"] } },
  },
  assessment: {
    decision: "review",
    reasons: [],
    fields: [
      { path: "invoice_no", status: "verified", needs_review: false, reasons: [], boxes: [box], found_in: [] },
      { path: "seller.name", status: "verified", needs_review: false, reasons: [], boxes: [box], found_in: [] },
      { path: "lines[0].qty", status: "not_in_cited_blocks", needs_review: true, reasons: ["not found in the cited source text"], boxes: [box], found_in: [] },
      { path: "totals.grand_total", status: "verified", needs_review: false, reasons: [], boxes: [box], found_in: [] },
    ],
    rules: [
      { rule_id: "totals.sum", version: 1, severity: "error", outcome: "failed", message: "Total is ₹180.00 more than the lines plus GST", paths: ["totals.grand_total"] },
      { rule_id: "required.present", version: 1, severity: "error", outcome: "passed", message: "OK", paths: ["invoice_no"] },
    ],
    issues: [],
  },
  editable_paths: ["invoice_no", "seller.name", "lines[0].qty", "totals.grand_total"],
  corrections: [{ path: "seller.name", old_text: "Medisynth Pharm", new_text: "Medisynth Pharma", reason: "OCR dropped a letter", reviewer_name: "Priya Nair", created_at: "2026-10-08T06:00:00Z" }],
  match_status: "mismatch",
  discrepancies: [],
  counterpart_document_id: null,
  review: null,
  signature_valid: null,
  record_sha256: "a".repeat(64),
  meanings: { approved: "I approve this invoice for payment", rejected: "I reject this invoice" },
  superseded: false,
  certificates: [],
} satisfies Review;

describe("the values of a document", () => {
  const fields = buildFields(review);
  const at = (path: string) => fields.find((field) => field.path === path)!;

  it("shows each value as printed, in its group, with its box", () => {
    expect(at("totals.grand_total")).toMatchObject({ label: "Totals · Grand total", group: "Totals", display: "4,12,877.60" });
    expect(at("lines[0].qty").group).toBe("Lines");
    expect(at("seller.name").group).toBe("Parties");
    expect(at("invoice_no").group).toBe("Invoice");
    expect(at("invoice_no").boxes).toEqual([box]);
  });

  it("shows the place and its code apart when one printed string holds both", () => {
    const place = { raw: "Gujarat (24)", block_ids: ["b5"] };
    const both = buildFields({
      ...review,
      record: { ...review.record, place_of_supply: { ...place, value: "Gujarat" }, place_of_supply_code: { ...place, value: "24" } },
      editable_paths: [...review.editable_paths, "place_of_supply", "place_of_supply_code"],
    });
    expect(both.find((field) => field.path === "place_of_supply")!.display).toBe("Gujarat");
    expect(both.find((field) => field.path === "place_of_supply_code")!.display).toBe("24");
  });

  it("says each check in words, the most serious first", () => {
    expect(at("invoice_no")).toMatchObject({ status: "passed", flagged: false });
    expect(at("lines[0].qty")).toMatchObject({ status: "uncertain", flagged: true });
    expect(at("lines[0].qty").checks[0]).toMatchObject({ word: "Uncertain", text: "Not found in the cited source text." });
    expect(at("totals.grand_total")).toMatchObject({ status: "failed", flagged: true });
    expect(at("totals.grand_total").checks[0]).toEqual({ kind: "fail", word: "Failed", text: "Total is ₹180.00 more than the lines plus GST" });
    expect(at("seller.name")).toMatchObject({ status: "corrected", flagged: false });
    expect(at("seller.name").checks[0].text).toBe("by Priya Nair from Medisynth Pharm. OCR dropped a letter");
  });

  it("points each blocker at the value or the tab that answers it", () => {
    expect(blockerTarget("1 value was not found in the source text it cites", fields)).toEqual({ path: "lines[0].qty" });
    expect(blockerTarget("1 check failed: totals.sum", fields)).toEqual({ path: "totals.grand_total" });
    expect(blockerTarget("it does not match its purchase order", fields)).toEqual({ tab: "order" });
    expect(blockerTarget("the certificate for batch X has results outside their limits", fields)).toEqual({ tab: "certificates" });
  });

  it("points a possible duplicate at the earlier bill", () => {
    const duplicates = [
      { document_id: "d0", filename: "bill.pdf", matched_on: "irn" as const },
      { document_id: "d9", filename: "bill (2).pdf", matched_on: "seller_and_number" as const },
    ];
    expect(blockerTarget("it may be a duplicate of bill (2).pdf, which has the same seller GSTIN and invoice number", fields, duplicates)).toEqual({ document: "d9" });
    expect(blockerTarget("it may be a duplicate of bill.pdf, which has the same IRN", fields, duplicates)).toEqual({ document: "d0" });
    // An older API without the list: nowhere to go.
    expect(blockerTarget("it may be a duplicate of bill.pdf, which has the same IRN", fields)).toBeNull();
  });

  it("groups other document types sensibly", () => {
    expect(groupOf("tests[2].result", "coa")).toBe("Tests");
    expect(groupOf("supplier_name", "purchase_order")).toBe("Parties");
    expect(groupOf("po_no", "purchase_order")).toBe("Order");
    expect(groupOf("batch_no", "coa")).toBe("Certificate");
  });
});

describe("near-expiry stock (V2 3.4)", () => {
  const shelf = (path: string, months = 4) => ({
    rule_id: "line.shelf_life", version: 2, severity: "warning", outcome: "failed", paths: [path],
    message: `Stock expires 2027-01, ${months} months after the bill date; this workspace flags stock with less than 6 months left.`,
  });  // prettier-ignore
  const near = (rules: Review["assessment"]["rules"], months = 6): Review => ({
    ...review,
    near_expiry_months: months,
    record: { ...review.record, lines: [{ expiry: { value: "2027-01", raw: "01/27", block_ids: ["b40"] } }, { expiry: { value: "2027-02", raw: "02/27", block_ids: ["b41"] } }] },
    assessment: {
      ...review.assessment,
      fields: [...review.assessment.fields, { path: "lines[0].expiry", status: "verified", needs_review: false, reasons: [], boxes: [box], found_in: [] }],
      rules: [...review.assessment.rules, ...rules],
    },
  });

  it("is an amber flag on the expiry, not a failed value and not something for a person", () => {
    const field = buildFields(near([shelf("lines[0].expiry")])).find((f) => f.path === "lines[0].expiry");

    expect(field?.status).toBe("passed");
    expect(field?.flagged).toBe(false);
    expect(field?.checks).toEqual([{ kind: "warn", word: "Near expiry", text: expect.stringContaining("4 months after the bill date") }]);
  });

  it("does not hide a real failure on the same value", () => {
    const expired = { rule_id: "line.not_expired", version: 1, severity: "error", outcome: "failed", message: "Stock expired", paths: ["lines[0].expiry"] };
    const field = buildFields(near([expired, shelf("lines[0].expiry")])).find((f) => f.path === "lines[0].expiry");

    expect(field?.status).toBe("failed");
    expect(field?.checks.map((c) => c.word)).toEqual(["Failed", "Near expiry"]);
  });

  it("is summed up by line, with the workspace's window", () => {
    expect(nearExpiryPaths(near([shelf("lines[0].expiry"), shelf("lines[1].expiry")]))).toEqual(["lines[0].expiry", "lines[1].expiry"]);
    expect(nearExpirySummary(near([shelf("lines[0].expiry"), shelf("lines[1].expiry")]))).toBe("2 lines expire within 6 months of the bill");
    expect(nearExpirySummary(near([shelf("lines[0].expiry")], 1))).toBe("1 line expires within 1 month of the bill");
  });

  it("says nothing when no line is near expiry, the flag is off, or the API predates it", () => {
    expect(nearExpirySummary(near([]))).toBeNull();
    expect(nearExpirySummary(near([{ ...shelf("lines[0].expiry"), outcome: "passed" }]))).toBeNull();
    expect(nearExpirySummary(near([shelf("lines[0].expiry")], 0))).toBeNull();
    const older: Review = near([shelf("lines[0].expiry")]);
    delete older.near_expiry_months;
    expect(nearExpirySummary(older)).toBeNull();
  });
});
