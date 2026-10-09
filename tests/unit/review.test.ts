import { describe, expect, it } from "vitest";
import { blockerTarget, buildFields, groupOf, type Review } from "@/lib/review";

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

  it("groups other document types sensibly", () => {
    expect(groupOf("tests[2].result", "coa")).toBe("Tests");
    expect(groupOf("supplier_name", "purchase_order")).toBe("Parties");
    expect(groupOf("po_no", "purchase_order")).toBe("Order");
    expect(groupOf("batch_no", "coa")).toBe("Certificate");
  });
});
