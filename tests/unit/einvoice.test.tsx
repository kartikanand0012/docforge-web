import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EinvoiceBanner } from "@/components/document/EinvoiceBanner";
import { einvoiceBanner, type Einvoice, type EinvoiceRule } from "@/lib/einvoice";

const rule = (rule_id: string, outcome: EinvoiceRule["outcome"], severity: EinvoiceRule["severity"] = "error", message = `${rule_id} ${outcome}`): EinvoiceRule => ({
  rule_id,
  outcome,
  severity,
  message,
});

const passed = ["signature", "seller_gstin", "buyer_gstin", "invoice_no", "invoice_date", "grand_total"].map((id) => rule(`einvoice.${id}`, "passed"));

const verified: Einvoice = {
  status: "verified",
  reason: null,
  irp: "NIC1",
  key_name: "NIC1-2024",
  key_confirmed: true,
  page: 1,
  altered_beside: false,
  signed: {
    seller_gstin: "24AAACM1234F1Z5",
    buyer_gstin: "27AAACB5678K1Z2",
    invoice_no: "MS/24-25/04417",
    document_type: "INV",
    invoice_date: "2026-10-08",
    total: "412877.60",
    line_count: 3,
    main_hsn: "3004",
    irn: "b".repeat(64),
    irn_date: "2026-10-08 10:12:00",
  },
  rules: passed,
};

describe("the e-invoice banner's words", () => {
  it("a verified QR whose fields match says who signed it and what matches", () => {
    const banner = einvoiceBanner(verified)!;
    expect(banner.kind).toBe("ok");
    expect(banner.title).toBe("Verified e-invoice");
    expect(banner.lines[0]).toBe("Signed by NIC IRP-1. Seller GSTIN, buyer GSTIN, invoice number, date and total match the page.");
  });

  it("a verified QR that disagrees with the page says what disagrees", () => {
    const banner = einvoiceBanner({
      ...verified,
      rules: [...passed.filter((r) => r.rule_id !== "einvoice.grand_total"), rule("einvoice.grand_total", "failed", "error", "The signed total is ₹412,877.60; the page says ₹512,877.60")],
    })!;
    expect(banner.kind).toBe("fail");
    expect(banner.title).toBe("E-invoice QR disagrees with the page");
    expect(banner.lines).toContain("The signed total is ₹412,877.60; the page says ₹512,877.60.");
    expect(banner.lines[0]).toBe("Signed by NIC IRP-1.");
  });

  it("a warning alone leaves it verified but says so", () => {
    const banner = einvoiceBanner({ ...verified, rules: [...passed, rule("einvoice.irn_printed", "failed", "warning", "The IRN is not printed on the page")] })!;
    expect(banner.kind).toBe("warn");
    expect(banner.title).toBe("Verified e-invoice");
    expect(banner.lines).toContain("The IRN is not printed on the page.");
  });

  it("an altered QR beside the verified one is never shown as fine", () => {
    const banner = einvoiceBanner({ ...verified, altered_beside: true })!;
    expect(banner.kind).not.toBe("ok");
    expect(banner.lines).toContain("Another QR on this invoice was altered after it was signed.");
  });

  it("comparisons that did not run are not shown as matches", () => {
    const none = einvoiceBanner({ ...verified, rules: [] })!;
    expect(none.kind).toBe("warn");
    expect(none.lines).toContain("Not compared with the page: seller GSTIN, buyer GSTIN, invoice number, date and total.");
    const some = einvoiceBanner({ ...verified, rules: [...passed.filter((r) => r.rule_id !== "einvoice.invoice_date"), rule("einvoice.invoice_date", "not_evaluated")] })!;
    expect(some.kind).toBe("warn");
    expect(some.lines).toContain("Not compared with the page: date.");
  });

  it("lines that repeat are all shown", () => {
    const same = rule("einvoice.line_count", "failed", "warning", "Its key is not yet confirmed against a real QR");
    render(<EinvoiceBanner einvoice={{ ...verified, key_confirmed: false, rules: [...passed, same] }} />);
    expect(screen.getAllByText("Its key is not yet confirmed against a real QR.")).toHaveLength(2);
  });

  it("an unconfirmed key says so", () => {
    const banner = einvoiceBanner({ ...verified, key_confirmed: false })!;
    expect(banner.lines).toContain("Its key is not yet confirmed against a real QR.");
  });

  it("an altered QR says its signature is invalid", () => {
    const banner = einvoiceBanner({ ...verified, status: "bad_signature", signed: null, irp: null, key_name: null, reason: "the signature does not match", rules: [rule("einvoice.signature", "failed")] })!;
    expect(banner.kind).toBe("fail");
    expect(banner.title).toBe("QR signature invalid");
    expect(banner.lines[0]).toMatch(/changed after it was signed/);
  });

  it("an unknown key and an unreadable QR are warnings with their reason", () => {
    const unknown = einvoiceBanner({ ...verified, status: "unknown_key", signed: null, irp: null, reason: "signed with a key DocForge does not hold", rules: [] })!;
    expect(unknown.kind).toBe("warn");
    expect(unknown.title).toBe("E-invoice QR not checked");
    expect(unknown.lines).toContain("Signed with a key DocForge does not hold.");
    const malformed = einvoiceBanner({ ...verified, status: "malformed", signed: null, irp: null, reason: "its payload is not JSON", rules: [] })!;
    expect(malformed.title).toBe("E-invoice QR could not be read");
  });

  it("no QR, a failed scan, a never-scanned document or an older API show nothing", () => {
    expect(einvoiceBanner({ ...verified, status: "none", signed: null, rules: [] })).toBeNull();
    expect(einvoiceBanner({ ...verified, status: "unreadable", signed: null, rules: [] })).toBeNull();
    expect(einvoiceBanner(null)).toBeNull();
    expect(einvoiceBanner(undefined)).toBeNull();
  });

  it("a stored check that cannot be read keeps it in review and says so", () => {
    const banner = einvoiceBanner({ ...verified, signed: null, reason: "the stored check could not be read", rules: [rule("einvoice.signature", "not_evaluated")] })!;
    expect(banner.kind).toBe("warn");
    expect(banner.title).toBe("E-invoice QR not checked");
    expect(banner.lines).toContain("The stored check could not be read.");
  });
});

describe("the e-invoice banner", () => {
  it("is a labelled region whose status is in words, not colour alone", () => {
    render(<EinvoiceBanner einvoice={verified} />);
    const region = screen.getByRole("region", { name: "E-invoice QR" });
    expect(region).toHaveTextContent("Verified e-invoice");
    expect(region).toHaveTextContent("Signed by NIC IRP-1");
    expect(region).toHaveTextContent("Invoice MS/24-25/04417");
    expect(region).toHaveTextContent("b".repeat(64));
  });

  it("renders nothing without a QR", () => {
    const { container } = render(<EinvoiceBanner einvoice={{ ...verified, status: "none", signed: null, rules: [] }} />);
    expect(container).toBeEmptyDOMElement();
  });
});
