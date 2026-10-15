/** An invoice's signed GST e-invoice QR as the review screen shows it: EinvoiceOut (on
 * ReviewOut.einvoice) turned into a banner's kind, title and lines. */

export type EinvoiceRule = { rule_id: string; outcome: string; severity: string; message: string };
export type SignedInvoice = {
  seller_gstin: string; buyer_gstin: string; invoice_no: string; document_type: string;
  invoice_date: string; total: string; line_count: number; main_hsn: string | null;
  irn: string; irn_date: string | null;
};  // prettier-ignore
export type Einvoice = {
  status: "verified" | "bad_signature" | "malformed" | "unknown_key" | "none" | "unreadable";
  reason: string | null;
  irp: string | null;
  key_name: string | null;
  key_confirmed: boolean;
  page: number | null;
  altered_beside: boolean;
  signed: SignedInvoice | null;
  rules: EinvoiceRule[];
};

export type EinvoiceBanner = { kind: "ok" | "warn" | "fail"; title: string; lines: string[] };

const PORTALS: Record<string, string> = { NIC1: "NIC IRP-1", NIC2: "NIC IRP-2", NIC: "NIC" };

// The fields a verified QR is compared on, in the order the banner names them.
const MATCHED: [string, string][] = [
  ["einvoice.seller_gstin", "seller GSTIN"],
  ["einvoice.buyer_gstin", "buyer GSTIN"],
  ["einvoice.invoice_no", "invoice number"],
  ["einvoice.invoice_date", "date"],
  ["einvoice.grand_total", "total"],
];

const sentence = (text: string) => {
  const trimmed = text.trim();
  const capital = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  return /[.!?]$/.test(capital) ? capital : `${capital}.`;
};

const list = (items: string[]) => (items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`);

/** The banner for `einvoice`; null when there is nothing to say: no QR, a failed scan, a
 * document never scanned, or an API from before e-invoice checks. */
export function einvoiceBanner(einvoice: Einvoice | null | undefined): EinvoiceBanner | null {
  if (!einvoice || einvoice.status === "none" || einvoice.status === "unreadable") return null;
  const reason = einvoice.reason ? [sentence(einvoice.reason)] : [];
  if (einvoice.status === "bad_signature") {
    return { kind: "fail", title: "QR signature invalid", lines: ["The e-invoice QR was changed after it was signed, so nothing in it can be trusted."] };
  }
  if (einvoice.status === "unknown_key") return { kind: "warn", title: "E-invoice QR not checked", lines: reason };
  if (einvoice.status === "malformed") return { kind: "warn", title: "E-invoice QR could not be read", lines: reason };
  if (!einvoice.signed) return { kind: "warn", title: "E-invoice QR not checked", lines: reason };

  const portal = einvoice.irp ? (PORTALS[einvoice.irp] ?? einvoice.irp) : "its portal";
  const failed = einvoice.rules.filter((rule) => rule.outcome === "failed");
  const errors = failed.filter((rule) => rule.severity === "error");
  const warnings = failed.filter((rule) => rule.severity !== "error");
  const outcome = new Map(einvoice.rules.map((rule) => [rule.rule_id, rule.outcome]));
  const matched = MATCHED.filter(([id]) => outcome.get(id) === "passed").map(([, name]) => name);
  const head = !errors.length && matched.length ? `Signed by ${portal}. ${sentence(`${list(matched)} match the page`)}` : `Signed by ${portal}.`;
  const lines = [head, ...[...errors, ...warnings].map((rule) => sentence(rule.message))];
  if (!einvoice.key_confirmed) lines.push("Its key is not yet confirmed against a real QR.");
  if (errors.length) return { kind: "fail", title: "E-invoice QR disagrees with the page", lines };
  return { kind: warnings.length ? "warn" : "ok", title: "Verified e-invoice", lines };
}
