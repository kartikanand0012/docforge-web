/** Export runs (V2 P1): approved bills over a range of India's dates, under the workspace's
 * Tally or Marg names. A run with anything unmapped stops with a task list and makes no file.
 * V2 P3: a Marg purchase import is written in the layout of the workspace's active Marg
 * profile, and stops before any file for a line the import would be refused for. */

import { ApiError, api, apiUrl, errorFrom } from "@/lib/api";
import { indiaToday, plural } from "@/lib/flags";
import { onDay, type Books, type Tasks } from "@/lib/mappings";

export type ExportFormat = "mapped_csv" | "marg_import";
export type RunProfile = { version_id: string; profile_id: string; name: string; version_no: number; sample: boolean };
export type Overlap = { run_id: string; created_at: string; format: ExportFormat; invoices: number };

export type ExportRun = {
  id: string; target: Books; from: string; to: string; status: "needs_mapping" | "ready"; invoices: number; lines: number;
  tasks: Tasks | null; file: { filename: string; sha256: string; size_bytes: number } | null; created_by: string; created_at: string;
  /** Absent from an API before V2 P3: a mapped CSV, with no profile and nothing exported before. */
  format?: ExportFormat; profile?: RunProfile | null; overlaps?: Overlap[];
};  // prettier-ignore

/** A mapped CSV sends no format, as before V2 P3 (the API's default); a Marg import names it. */
export function startRun(target: Books, from: string, to: string, format: ExportFormat = "mapped_csv"): Promise<ExportRun> {
  const json = format === "mapped_csv" ? { target, from, to } : { target, from, to, format };
  return api<ExportRun>("/exports/runs", { method: "POST", json });
}

export type RunResult = { kind: "run"; run: ExportRun } | { kind: "no_active_profile"; detail: string };

/** A run, or - for a Marg import in a workspace with no active Marg profile - that state, to
 * show the way to one instead of a sentence. Any other refusal is thrown as it came. */
export async function runExport(target: Books, from: string, to: string, format: ExportFormat = "mapped_csv"): Promise<RunResult> {
  try {
    return { kind: "run", run: await startRun(target, from, to, format) };
  } catch (caught) {
    if (caught instanceof ApiError && caught.status === 409 && caught.code === "no_active_profile") return { kind: "no_active_profile", detail: caught.detail };
    throw caught;
  }
}

/** "12 of these bills were already in the export of 12 Oct 2026": a warning; the file stands. */
export function overlapSentence(overlap: Overlap): string {
  const verb = overlap.invoices === 1 ? "was" : "were";
  const what = overlap.format === "marg_import" ? "Marg purchase import" : "export";
  return `${overlap.invoices.toLocaleString("en-IN")} of these bills ${verb} already in the ${what} of ${onDay(overlap.created_at)}.`;
}

/** "Marg profile ‘Shah Medicals’, version 3". */
export function profileWords(profile: Pick<RunProfile, "name" | "version_no">): string {
  return `Marg profile ‘${profile.name}’, version ${profile.version_no}`;
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
export async function fetchRunFile(run: Pick<ExportRun, "id" | "target" | "from" | "to"> & { file?: ExportRun["file"] }): Promise<{ blob: Blob; filename: string }> {
  const response = await fetch(apiUrl(`/exports/runs/${encodeURIComponent(run.id)}/file`), { cache: "no-store" });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw errorFrom(response.status, body, response.headers);
  }
  // A Marg import may be an Excel file: the run's own filename says which.
  const fallback = run.file?.filename || `docforge-${run.target}-${run.from}-to-${run.to}.csv`;
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
