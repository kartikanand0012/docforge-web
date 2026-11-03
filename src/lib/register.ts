/** The purchase register (V2 P4): a month's approved invoices, one row each, as an Excel file
 * the CA sets beside GSTR-2B. The preview is exactly what the file will hold. A 2B check sets
 * the month beside a GSTR-2B download the user uploads: a comparison, nothing filed or sent. */

import { ApiError, api, apiUrl, errorFrom, toLogin } from "@/lib/api";
import { filenameFrom } from "@/lib/exports";
import { money } from "@/lib/format";

const BASE = "/exports/purchase-register";

export type Totals = { taxable_value: string; cgst: string; sgst: string; igst: string; total_tax: string; invoice_total: string };

export type RegisterRow = {
  document_id: string; supplier_gstin: string | null; supplier_name: string | null; invoice_no: string | null; invoice_date: string | null;
  place_of_supply: string | null; taxable_value: string | null; cgst: string; sgst: string; igst: string; total_tax: string;
  invoice_total: string | null; note: string;
};  // prettier-ignore

export type Register = {
  month: string; supplier_gstin: string | null; invoices: number; totals: Totals; rows: RegisterRow[]; columns: string[];
  /** What the register leaves out (credit and debit notes), said on screen. */
  excluded: string;
  /** What the last column is, and is not, said by it. */
  note_help: string;
};  // prettier-ignore

export type TwoBInvoice = {
  supplier_gstin: string; trade_name: string | null; invoice_no: string; invoice_date: string | null; invoice_value: string | null;
  taxable_value: string; cgst: string; sgst: string; igst: string;
};  // prettier-ignore

export type Amount = "taxable_value" | "cgst" | "sgst" | "igst" | "invoice_total";
export type CheckStatus = "matched" | "amount_differs" | "docforge_only";
export type CheckedRow = { status: CheckStatus; document_id: string; twob: TwoBInvoice | null; differences: Partial<Record<Amount, string>> };

export type TwoBCheck = {
  month: string; matched: number; amount_differs: number; docforge_only: number; twob_only: number; rows: CheckedRow[];
  twob_only_invoices: TwoBInvoice[]; note: string;
};  // prettier-ignore

/** This month in India ("2026-11"), whatever the browser's zone: at 00:30 on 1 Nov in India it
 * is still October in UTC. */
export function indiaMonth(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit" }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}`;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "November 2026" from "2026-11". */
export function monthWords(month: string): string {
  const [year, number] = month.split("-").map(Number);
  return MONTHS[number - 1] ? `${MONTHS[number - 1]} ${year}` : month;
}

/** "05-Nov-2026" from "2026-11-05", as the file shows it. */
export function registerDay(date: string | null): string {
  if (!date) return "—";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  const name = match && MONTHS[Number(match[2]) - 1];
  return match && name ? `${match[3]}-${name.slice(0, 3)}-${match[1]}` : date;
}

/** The sentence the API gives when asked for a file with no invoice in it: said before asking. */
export function emptySentence(month: string, supplier: string | null): string {
  const who = supplier ? ` from ${supplier}` : "";
  return `No approved invoice${who} is dated in ${monthWords(month)}, so there is no register to make: approve the month's bills first, or choose another month.`;
}

/** The month's rows, count and totals: what the file will hold. */
export function getRegister(month: string, supplier?: string | null): Promise<Register> {
  const query = new URLSearchParams({ month });
  if (supplier?.trim()) query.set("supplier_gstin", supplier.trim());
  return api<Register>(`${BASE}?${query}`);
}

function registerForm(month: string, supplier?: string | null): FormData {
  const form = new FormData();
  form.append("month", month);
  if (supplier?.trim()) form.append("supplier_gstin", supplier.trim());
  return form;
}

export type RegisterFile = { kind: "file"; blob: Blob; filename: string } | { kind: "empty"; detail: string };

/** The register as an Excel file (with a "2B check" sheet when a GSTR-2B download is sent), or -
 * for a month with no approved invoice - the API's sentence, and no empty spreadsheet. */
export async function fetchRegisterFile(month: string, supplier?: string | null, twob?: File | null): Promise<RegisterFile> {
  const form = registerForm(month, supplier);
  if (twob) form.append("gstr2b", twob);
  const response = await fetch(apiUrl(`${BASE}/file`), { method: "POST", body: form, cache: "no-store" });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    if (response.status === 401 && response.headers.has("www-authenticate")) toLogin();
    const error = errorFrom(response.status, body, response.headers);
    if (error.status === 422 && error.code === "register_empty") return { kind: "empty", detail: error.detail };
    throw error;
  }
  const fallback = `docforge-purchase-register-${month}.xlsx`;
  return { kind: "file", blob: await response.blob(), filename: filenameFrom(response.headers.get("content-disposition"), fallback) };
}

/** Sets the month beside the GSTR-2B download (Excel or JSON). Nothing is stored. */
export function checkTwoB(file: File, month: string, supplier?: string | null): Promise<TwoBCheck> {
  const form = registerForm(month, supplier);
  form.append("file", file);
  return api<TwoBCheck>(`${BASE}/2b-check`, { method: "POST", body: form });
}

export const STATUS_WORDS: Record<CheckStatus, string> = {
  matched: "Matched",
  amount_differs: "Amount differs",
  docforge_only: "In DocForge only",
};

const AMOUNT_WORDS: Record<Amount, string> = {
  taxable_value: "Taxable value",
  cgst: "CGST",
  sgst: "SGST",
  igst: "IGST",
  invoice_total: "Invoice total",
};

/** A difference is DocForge less 2B: "Taxable value ₹250.00 more in DocForge", or "CGST ₹45.00
 * more in 2B" when 2B's is the higher. */
export function differenceWords(amount: Amount, difference: string): string {
  const value = Number(difference);
  const label = AMOUNT_WORDS[amount] ?? amount;
  if (!Number.isFinite(value) || value === 0) return `${label} differs`;
  return `${label} ${money(Math.abs(value))} more in ${value > 0 ? "DocForge" : "2B"}`;
}

/** Each difference of a row, in the register's column order. */
export function differencesOf(row: Pick<CheckedRow, "differences">): string[] {
  return (Object.keys(AMOUNT_WORDS) as Amount[]).flatMap((amount) => {
    const difference = row.differences[amount];
    return difference === undefined || difference === null ? [] : [differenceWords(amount, difference)];
  });
}

const CELL: Record<string, (row: RegisterRow) => string> = {
  "Supplier GSTIN": (row) => row.supplier_gstin ?? "—",
  "Supplier Name": (row) => row.supplier_name ?? "—",
  "Invoice Number": (row) => row.invoice_no ?? "—",
  "Invoice Date": (row) => registerDay(row.invoice_date),
  "Place of Supply (code)": (row) => row.place_of_supply ?? "—",
  "Taxable Value": (row) => money(row.taxable_value),
  CGST: (row) => money(row.cgst),
  SGST: (row) => money(row.sgst),
  IGST: (row) => money(row.igst),
  "Total Tax": (row) => money(row.total_tax),
  "Invoice Total": (row) => money(row.invoice_total),
  "Reverse Charge": () => "",
  "ITC Eligibility Note": (row) => row.note,
};

const MONEY_COLUMNS = new Set(["Taxable Value", "CGST", "SGST", "IGST", "Total Tax", "Invoice Total"]);

/** A row's cell under the file's header, as the file shows it. */
export function cellOf(column: string, row: RegisterRow): string {
  return CELL[column]?.(row) ?? "";
}

export const isMoneyColumn = (column: string) => MONEY_COLUMNS.has(column);

export const TOTALS: { key: keyof Totals; label: string }[] = [
  { key: "taxable_value", label: "Taxable value" },
  { key: "cgst", label: "CGST" },
  { key: "sgst", label: "SGST" },
  { key: "igst", label: "IGST" },
  { key: "total_tax", label: "Total tax" },
  { key: "invoice_total", label: "Invoice total" },
];

/** Any refusal as the API worded it. */
export function sentenceOf(caught: unknown, fallback: string): string {
  return caught instanceof ApiError ? caught.detail : fallback;
}
