/** Split Review (V2 P6): a file holding several invoices, its pages grouped as the splitter
 * proposed, for a person to confirm or adjust before any invoice is made. Every page is in one
 * invoice or in "not an invoice page"; the counts always add up (`counts`), and the server
 * checks the same again. */

import { api, apiUrl } from "@/lib/api";

export type SplitGroup = {
  pages: number[]; invoice_no: string | null; seller_gstin: string | null; document_id: string | null;
  document_status: string | null; new: boolean;
};  // prettier-ignore

export type SplitCounts = { pages: number; invoices: number; invoice_pages: number; non_invoice_pages: number };

export type Split = {
  document_id: string; filename: string; status: "review" | "split" | string; automatic: boolean; reason: string | null;
  page_count: number; proposed: SplitGroup[]; proposed_non_invoice: number[]; pages_in_doubt: number[];
  groups: SplitGroup[]; non_invoice: number[]; counts: SplitCounts; decided_by: string | null;
  decided_person: string | null; decided_at: string | null; created_at: string;
};  // prettier-ignore

/** What a person is shaping: page numbers per invoice, and pages that are no invoice. */
export type Grouping = { groups: number[][]; nonInvoice: number[] };

export const splitPath = (documentId: string) => `/splits/${documentId}`;
export const thumbnailUrl = (documentId: string, page: number) => apiUrl(`/documents/${documentId}/pages/${page}?size=thumbnail`);

export function fromProposal(split: Split): Grouping {
  return { groups: split.proposed.map((group) => [...group.pages]), nonInvoice: [...split.proposed_non_invoice] };
}

/** Pages in order, empty invoices gone, invoices in the order of their first page. */
export function tidy(grouping: Grouping): Grouping {
  const groups = grouping.groups.map((pages) => [...pages].sort((a, b) => a - b)).filter((pages) => pages.length > 0);
  groups.sort((a, b) => a[0] - b[0]);
  return { groups, nonInvoice: [...grouping.nonInvoice].sort((a, b) => a - b) };
}

function without(grouping: Grouping, page: number): Grouping {
  return { groups: grouping.groups.map((pages) => pages.filter((p) => p !== page)), nonInvoice: grouping.nonInvoice.filter((p) => p !== page) };
}

export function groupOf(grouping: Grouping, page: number): number {
  return grouping.groups.findIndex((pages) => pages.includes(page));
}

/** The page joins the invoice before its own (from "not an invoice", the nearest invoice
 * before the page). Nothing changes when there is none. */
export function toPrevious(grouping: Grouping, page: number): Grouping {
  const at = groupOf(grouping, page);
  const target = at >= 0 ? at - 1 : grouping.groups.reduce((found, pages, index) => (pages[0] < page ? index : found), -1);
  if (target < 0) return grouping;
  const moved = without(grouping, page);
  moved.groups[target] = [...moved.groups[target], page];
  return tidy(moved);
}

/** The page joins the invoice after its own; after the last, it starts a new invoice. */
export function toNext(grouping: Grouping, page: number): Grouping {
  const at = groupOf(grouping, page);
  const target = at >= 0 ? at + 1 : grouping.groups.findIndex((pages) => pages[0] > page);
  const moved = without(grouping, page);
  if (target < 0 || target >= moved.groups.length) moved.groups.push([page]);
  else moved.groups[target] = [...moved.groups[target], page];
  return tidy(moved);
}

/** A new invoice starts at this page: it and the pages after it in its invoice move into it. */
export function startHere(grouping: Grouping, page: number): Grouping {
  const at = groupOf(grouping, page);
  if (at < 0) return tidy({ ...without(grouping, page), groups: [...without(grouping, page).groups, [page]] });
  const pages = grouping.groups[at];
  const before = pages.filter((p) => p < page);
  if (before.length === 0) return grouping;
  const groups = grouping.groups.flatMap((g, index) => (index === at ? [before, pages.filter((p) => p >= page)] : [g]));
  return tidy({ groups, nonInvoice: grouping.nonInvoice });
}

/** In or out of "not an invoice page"; back in, it joins the nearest invoice before it. */
export function toggleNotInvoice(grouping: Grouping, page: number): Grouping {
  if (grouping.nonInvoice.includes(page)) {
    const back = toPrevious(grouping, page);
    return back === grouping ? toNext(grouping, page) : back;
  }
  const moved = without(grouping, page);
  return tidy({ groups: moved.groups, nonInvoice: [...moved.nonInvoice, page] });
}

/** parent pages = invoice pages + non-invoice pages, each page once. */
export function counts(grouping: Grouping, pageCount: number): SplitCounts & { reconciles: boolean } {
  const placed = [...grouping.groups.flat(), ...grouping.nonInvoice];
  const each = new Set(placed);
  const reconciles =
    placed.length === pageCount && each.size === pageCount && [...each].every((p) => p >= 1 && p <= pageCount) && grouping.groups.every((g) => g.length > 0);
  return {
    pages: pageCount,
    invoices: grouping.groups.length,
    invoice_pages: grouping.groups.reduce((sum, g) => sum + g.length, 0),
    non_invoice_pages: grouping.nonInvoice.length,
    reconciles,
  };
}

export function pagesWord(pages: number[]): string {
  if (pages.length === 1) return `page ${pages[0]}`;
  const run = pages.every((p, i) => i === 0 || p === pages[i - 1] + 1);
  return run ? `pages ${pages[0]}–${pages[pages.length - 1]}` : `pages ${pages.join(", ")}`;
}

/** Group pages: whoever reviews bills. */
export function mayGroup(role: string, viewing = false): boolean {
  return !viewing && (role === "admin" || role === "reviewer" || role === "member");
}

export function getSplit(documentId: string): Promise<Split> {
  return api<Split>(`/documents/${encodeURIComponent(documentId)}/split`);
}

export function listSplits(status: "review" | "split" | "all" = "review"): Promise<Split[]> {
  return api<Split[]>(`/splits?status=${status}`);
}

export function confirmSplit(documentId: string, grouping: Grouping): Promise<Split> {
  const tidied = tidy(grouping);
  return api<Split>(`/documents/${encodeURIComponent(documentId)}/split`, {
    method: "POST",
    json: { groups: tidied.groups, non_invoice: tidied.nonInvoice },
  });
}
