// The PO variance (V2 P7): one bill against its PO in rupees (the document's panel), and a month
// of them as the "PO Variance Report (Excel)" export. Every amount is the API's own (Decimal as
// text); this file only words and formats them.
import { ApiError, api, apiUrl, errorFrom, toLogin } from "@/lib/api";
import { filenameFrom } from "@/lib/exports";
import { count, money } from "@/lib/format";

const BASE = "/exports/po-variance";

export type VarianceStatus = "variance" | "within_tolerance" | "not_compared";
export type Difference = {
  field: "rate" | "qty" | "free_qty" | "taxable";
  label: string; // Rate, Qty, Free Qty, Taxable Amount
  status: VarianceStatus;
  po_value: string | number | null;
  billed_value: string | number | null;
  difference: string | number | null; // billed less PO
  money_impact: string | null; // null when matched within tolerance or not compared
  working: string | null; // the arithmetic, in words
  note: string | null;
};
export type VarianceLine = { line: number; order_line: number; product: string | null; clean: boolean; note: string | null; differences: Difference[] };
export type Unpaired = { line: number; product: string | null; qty: number | null; rate: string | null; value: string | null; working: string | null; note: string | null };
export type Tolerances = { rate: string; qty: number; free_qty: number; amount: string };
export type Variance = {
  invoice_no: string | null;
  po_no: string | null;
  supplier_name: string | null;
  supplier_gstin: string | null;
  invoice_total: string | null;
  po_total: string;
  net_impact: string;
  net_percent: string | null;
  above_po: string;
  lines_checked: number;
  lines_matched: number;
  variances: number;
  not_compared: number;
  lines: VarianceLine[];
  not_in_po: Unpaired[];
  not_billed: Unpaired[];
  not_in_po_value: string;
  not_billed_value: string;
  tolerances: Tolerances;
  sign_note: string;
};

export type SupplierVariance = {
  supplier_gstin: string | null;
  supplier_name: string | null;
  invoices_checked: number;
  lines_checked: number;
  lines_matched: number;
  variances: number;
  not_compared: number;
  not_in_po_lines: number;
  not_billed_lines: number;
  above_po: string;
  net_impact: string;
};
export type CheckedInvoice = {
  document_id: string;
  order_document_id: string;
  invoice_no: string | null;
  invoice_date: string | null;
  po_no: string | null;
  supplier_gstin: string | null;
  supplier_name: string | null;
  invoice_total: string | null;
  po_total: string;
  net_impact: string;
  net_percent: string | null;
  above_po: string;
  lines_checked: number;
  lines_matched: number;
  variances: number;
  not_in_po_lines: number;
  not_billed_lines: number;
};
export type NotChecked = { document_id: string; invoice_no: string | null; invoice_date: string | null; supplier_gstin: string | null; supplier_name: string | null; reason: string };
export type VarianceReport = {
  month: string;
  supplier_gstin: string | null;
  tolerances: Tolerances;
  totals: SupplierVariance;
  suppliers: SupplierVariance[];
  invoices: CheckedInvoice[];
  not_checked: NotChecked[];
  sign_note: string;
};

const MINUS = "−";

/** Rupees with their sign: "+₹600.00" above the PO, "−₹1,000.00" below, "₹0.00" for none. */
export function signedMoney(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  if (number === 0) return money(0);
  return `${number > 0 ? "+" : MINUS}${money(Math.abs(number))}`;
}

/** A field's value as printed: rupees for rates and amounts, a plain count for quantities. */
export function valueWords(field: Difference["field"], value: string | number | null): string {
  if (value === null || value === undefined) return "—";
  if (field === "qty" || field === "free_qty") return count(Number(value));
  return money(value);
}

export function differenceWords(field: Difference["field"], value: string | number | null): string {
  if (value === null || value === undefined) return "—";
  const number = Number(value);
  if (field === "qty" || field === "free_qty") return number > 0 ? `+${count(number)}` : number < 0 ? `${MINUS}${count(-number)}` : "0";
  return signedMoney(number);
}

export function linesMatched(n: number): string {
  return n === 1 ? "1 line matched" : `${count(n)} lines matched`;
}

export function percentWords(value: string | null): string {
  if (value === null) return "";
  const number = Number(value);
  return ` (${number > 0 ? "+" : number < 0 ? MINUS : ""}${Math.abs(number).toFixed(2)}%)`;
}

export const STATUS_WORDS: Record<VarianceStatus, string> = {
  variance: "Variance",
  within_tolerance: "Matched within tolerance",
  not_compared: "Not compared",
};

export function getVarianceReport(month: string, supplier?: string | null): Promise<VarianceReport> {
  const query = new URLSearchParams({ month });
  if (supplier?.trim()) query.set("supplier_gstin", supplier.trim());
  return api<VarianceReport>(`${BASE}?${query}`);
}

export type VarianceFile = { kind: "file"; blob: Blob; filename: string } | { kind: "empty"; detail: string };

/** The report as an Excel file, or - for a month with no invoice in it - the API's sentence. */
export async function fetchVarianceFile(month: string, supplier?: string | null): Promise<VarianceFile> {
  const form = new FormData();
  form.append("month", month);
  if (supplier?.trim()) form.append("supplier_gstin", supplier.trim());
  const response = await fetch(apiUrl(`${BASE}/file`), { method: "POST", body: form, cache: "no-store" });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    if (response.status === 401 && response.headers.has("www-authenticate")) toLogin();
    const error = errorFrom(response.status, body, response.headers);
    if (error.status === 422 && error.code === "variance_empty") return { kind: "empty", detail: error.detail };
    throw error;
  }
  const fallback = `docforge-po-variance-${month}.xlsx`;
  return { kind: "file", blob: await response.blob(), filename: filenameFrom(response.headers.get("content-disposition"), fallback) };
}

export function sentenceOf(caught: unknown, fallback: string): string {
  return caught instanceof ApiError ? caught.detail : fallback;
}
