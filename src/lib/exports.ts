/** Export runs (V2 P1): approved bills over a range of India's dates, under the workspace's
 * Tally or Marg names. A run with anything unmapped stops with a task list and makes no file. */

import { api, apiUrl, errorFrom } from "@/lib/api";
import { indiaToday, plural } from "@/lib/flags";
import type { Books, Tasks } from "@/lib/mappings";

export type ExportRun = {
  id: string; target: Books; from: string; to: string; status: "needs_mapping" | "ready"; invoices: number; lines: number;
  tasks: Tasks | null; file: { filename: string; sha256: string; size_bytes: number } | null; created_by: string; created_at: string;
};  // prettier-ignore

export function startRun(target: Books, from: string, to: string): Promise<ExportRun> {
  return api<ExportRun>("/exports/runs", { method: "POST", json: { target, from, to } });
}

/** Newest first. */
export function listRuns(): Promise<ExportRun[]> {
  return api<ExportRun[]>("/exports/runs");
}

/** From the first of this month to today, in India's dates. */
export function monthSoFar(now: Date = new Date()): { from: string; to: string } {
  const to = indiaToday(now);
  return { from: `${to.slice(0, 8)}01`, to };
}

export function runSummary(run: Pick<ExportRun, "invoices" | "lines">): string {
  return `${plural(run.invoices, "invoice", "invoices")}, ${plural(run.lines, "line", "lines")}.`;
}

export function filenameFrom(disposition: string | null, fallback: string): string {
  const match = disposition?.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
  if (!match) return fallback;
  try {
    return decodeURIComponent(match[1].trim()) || fallback;
  } catch {
    return match[1].trim() || fallback;
  }
}

/** The run's file, checked against its hash by the API; a run without one is refused with a sentence. */
export async function fetchRunFile(run: Pick<ExportRun, "id" | "target" | "from" | "to">): Promise<{ blob: Blob; filename: string }> {
  const response = await fetch(apiUrl(`/exports/runs/${encodeURIComponent(run.id)}/file`), { cache: "no-store" });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw errorFrom(response.status, body, response.headers);
  }
  const fallback = `docforge-${run.target}-${run.from}-to-${run.to}.csv`;
  return { blob: await response.blob(), filename: filenameFrom(response.headers.get("content-disposition"), fallback) };
}

/** Hands a file to the browser as a download. */
export function saveFile(blob: Blob, filename: string): void {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 10_000); // some browsers read it after the click
}
