/** The mapping master (V2 P1): how this workspace's own books (Tally or Marg) name each
 * supplier (by seller GSTIN) and each item (printed product name + pack). DocForge only ever
 * offers a name; nothing is mapped until someone confirms it. */

import { api } from "@/lib/api";
import { plural } from "@/lib/flags";

export type Books = "tally" | "marg";
export type MappingKind = "suppliers" | "items";
export type MappingSource = "typed" | "suggestion";

type Made = { id: string; source: MappingSource; created_by: string; created_at: string; updated_by: string | null; updated_at: string | null };

export type SupplierMapping = Made & {
  seller_gstin: string; printed_name: string; tally_ledger: string | null; marg_party: string | null;
  purchase_ledger: string | null; tax_treatment: string | null;
};  // prettier-ignore

export type ItemMapping = Made & {
  item_key: string; product_name: string; pack: string | null; printed_hsn: string | null; tally_item: string | null;
  marg_item: string | null; preferred_hsn: string | null;
};  // prettier-ignore

export type Mapping = SupplierMapping | ItemMapping;
export type MappingPage<T extends Mapping = Mapping> = { items: T[]; total: number; next_after: string | null };

export type Suggestion = { name: string; gstin: string | null; source: "master" | "mapping"; score: number; why: string };
export type SupplierTask = { seller_gstin: string; printed_names: string[]; bills: number; mapping_id: string | null; suggestions: Suggestion[] };
export type ItemTask = {
  item_key: string; product_name: string; pack: string | null; printed_hsn: string | null; bills: number; mapping_id: string | null;
  suggestions: Suggestion[];
};  // prettier-ignore
export type Problem = { document_id: string; filename: string; problem: string };
export type Tasks = { suppliers: SupplierTask[]; items: ItemTask[]; problems: Problem[] };

export type ImportReport = { rows: number; imported: number; already_known: number; rejected: { line: number; reason: string }[] };

const BASE = "/settings/mappings";

export function listMappings<T extends Mapping = Mapping>(kind: MappingKind, q: string, after?: string | null): Promise<MappingPage<T>> {
  const params = new URLSearchParams({ limit: "50" });
  if (q.trim()) params.set("q", q.trim());
  if (after) params.set("after", after);
  return api<MappingPage<T>>(`${BASE}/${kind}?${params}`);
}

export function createMapping<T extends Mapping = Mapping>(kind: MappingKind, body: Record<string, string | null>): Promise<T> {
  return api<T>(`${BASE}/${kind}`, { method: "POST", json: body });
}

/** Only the fields named change; null clears one. */
export function changeMapping<T extends Mapping = Mapping>(kind: MappingKind, id: string, change: Record<string, string | null>): Promise<T> {
  return api<T>(`${BASE}/${kind}/${encodeURIComponent(id)}`, { method: "PATCH", json: change });
}

export function removeMapping(kind: MappingKind, id: string): Promise<void> {
  return api<void>(`${BASE}/${kind}/${encodeURIComponent(id)}`, { method: "DELETE" });
}

/** A masters CSV from Tally or Marg. The browser sets the multipart boundary itself. */
export function importMasters(file: File): Promise<ImportReport> {
  const form = new FormData();
  form.append("file", file);
  return api<ImportReport>(`${BASE}/import`, { method: "POST", body: form });
}

/** A run's tasks with names to offer. Only reads: nothing is applied. */
export function runSuggestions(runId: string): Promise<Tasks> {
  return api<Tasks>(`${BASE}/suggestions?${new URLSearchParams({ export_run_id: runId })}`);
}

/** Those who review bills change mappings; anyone in the workspace reads them. Nothing is
 * changed while an administrator is viewing someone's workspace. */
export function mayMap(role: string, viewing = false): boolean {
  return !viewing && (role === "admin" || role === "reviewer" || role === "member");
}

export const BOOKS_NAME: Record<Books, string> = { tally: "Tally", marg: "Marg" };

/** The field that holds a name in these books. */
export function nameField(kind: "supplier" | "item", books: Books): string {
  if (kind === "supplier") return books === "tally" ? "tally_ledger" : "marg_party";
  return books === "tally" ? "tally_item" : "marg_item";
}

export const NAME_LABEL: Record<string, string> = {
  tally_ledger: "Tally ledger", marg_party: "Marg party", tally_item: "Tally stock item", marg_item: "Marg item",
};  // prettier-ignore

/** "27 Oct 2026", the day in India. */
export function onDay(iso: string): string {
  const day = new Date(iso);
  return Number.isNaN(day.getTime()) ? iso : day.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}

/** "Created by Asha on 27 Oct 2026", or "Confirmed from a suggestion by …", then who changed it last. */
export function provenance(mapping: Made): string {
  const made = `${mapping.source === "suggestion" ? "Confirmed from a suggestion" : "Created"} by ${mapping.created_by} on ${onDay(mapping.created_at)}`;
  if (!mapping.updated_by) return made;
  return `${made} · Changed by ${mapping.updated_by}${mapping.updated_at ? ` on ${onDay(mapping.updated_at)}` : ""}`;
}

/** "Imported 995 names; 0 already known; 5 rows not imported:" */
export function importSummary(report: ImportReport): string {
  const head = `Imported ${plural(report.imported, "name", "names")}; ${report.already_known.toLocaleString("en-IN")} already known`;
  return report.rejected.length ? `${head}; ${plural(report.rejected.length, "row", "rows")} not imported:` : `${head}.`;
}

/** What stops an export, in one sentence. */
export function blockedSentence(tasks: Tasks): string {
  const after = "before this export can be made. No file was made.";
  const suppliers = tasks.suppliers.length;
  const items = tasks.items.length;
  if (!suppliers && !items) {
    const bills = tasks.problems.length;
    return `${plural(bills, "bill", "bills")} ${bills === 1 ? "needs" : "need"} correcting ${after}`;
  }
  const parts = [suppliers ? plural(suppliers, "supplier", "suppliers") : "", items ? plural(items, "item", "items") : ""].filter(Boolean);
  const one = parts.length === 1 && (suppliers || items) === 1;
  return `${parts.join(" and ")} ${one ? "needs" : "need"} mapping ${after}`;
}

export type TaskRef = { kind: "supplier"; task: SupplierTask } | { kind: "item"; task: ItemTask };
export type SaveRequest = { path: string; method: "POST" | "PATCH"; json: Record<string, string> };

/** What confirming a name for a task sends: a new mapping, or, where a mapping exists without
 * a name for these books, a change to it. "suggestion" only when the name saved is the one
 * clicked. */
export function confirmRequest(ref: TaskRef, books: Books, typed: string, clicked: string | null): SaveRequest {
  const name = typed.trim();
  const field = nameField(ref.kind, books);
  const kind: MappingKind = ref.kind === "supplier" ? "suppliers" : "items";
  if (ref.task.mapping_id) return { path: `${BASE}/${kind}/${ref.task.mapping_id}`, method: "PATCH", json: { [field]: name } };
  const source: MappingSource = clicked !== null && clicked.trim() === name ? "suggestion" : "typed";
  if (ref.kind === "supplier") {
    const task = ref.task;
    return { path: `${BASE}/${kind}`, method: "POST", json: { seller_gstin: task.seller_gstin, printed_name: task.printed_names[0] ?? task.seller_gstin, [field]: name, source } };
  }
  const task = ref.task;
  const json: Record<string, string> = { product_name: task.product_name };
  if (task.pack) json.pack = task.pack;
  if (task.printed_hsn) json.printed_hsn = task.printed_hsn;
  return { path: `${BASE}/${kind}`, method: "POST", json: { ...json, [field]: name, source } };
}
