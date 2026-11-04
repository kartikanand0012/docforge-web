/** Bulk upload (V2 P6): up to 50 files dropped together, or one ZIP of up to 200. Each file
 * becomes its own document through the upload's own checks. Dropped files are sent one request
 * each into a batch made first; a ZIP is sent whole and unpacked on the server. Once a file has
 * arrived, leaving the page stops nothing: the batch view counts it live. */

import { api, upload, type Uploaded } from "@/lib/api";
import type { StatusKind } from "@/lib/stages";

export const MAX_FILES = 50;
export const MAX_ZIP_FILES = 200;
export const MAX_ZIP_MB = 500;
export const SENT_AT_ONCE = 4;

export type BatchCounts = {
  total: number; not_sent: number; received: number; already_received: number; refused: number; waiting: number;
  processed: number; ready: number; split: number; failed: number;
};  // prettier-ignore

export type BatchItem = {
  id: string; position: number; filename: string; size_bytes: number; outcome: string; reason: string | null;
  document_id: string | null; state: string; error: string | null;
};  // prettier-ignore

export type Batch = {
  id: string; kind: "files" | "zip" | string; name: string | null; doc_type: string; expected: number; person: string;
  created_at: string; counts: BatchCounts; items: BatchItem[];
};  // prettier-ignore

export type BatchSummary = Omit<Batch, "items" | "doc_type" | "expected">;

export const batchPath = (id: string) => `/batches/${id}`;

export function isZip(file: { name: string; type?: string }): boolean {
  return file.name.toLowerCase().endsWith(".zip") || file.type === "application/zip" || file.type === "application/x-zip-compressed";
}

/** What a drop holds: ZIPs (each its own batch), other files, and whether those are too many. */
export function planDrop<F extends { name: string; type?: string }>(files: F[]): { zips: F[]; files: F[]; tooMany: boolean } {
  const zips = files.filter((file) => isZip(file));
  const rest = files.filter((file) => !isZip(file));
  return { zips, files: rest, tooMany: rest.length > MAX_FILES };
}

export const TOO_MANY = `Up to ${MAX_FILES} files can be dropped at once. For more, put them in a ZIP (up to ${MAX_ZIP_FILES} files) and drop that.`;

/** Every item exactly once: total = received + already received + refused. */
export function reconciles(counts: BatchCounts): boolean {
  return counts.received + counts.already_received + counts.refused === counts.total && counts.waiting + counts.processed === counts.total;
}

/** A file's state as a word, a badge kind, and a line of what to do. */
export function itemWords(item: BatchItem): { word: string; kind: StatusKind; text: string } {
  switch (item.state) {
    case "refused":
      return { word: "Refused", kind: "fail", text: item.reason ?? "This file was not accepted." };
    case "waiting":
      return item.outcome === "already_received"
        ? { word: "Already here", kind: "neutral", text: "This exact file was already in DocForge; it is not read again." }
        : { word: "Reading", kind: "info", text: "Queued or being read." };
    case "ready":
      return item.outcome === "already_received"
        ? { word: "Already here", kind: "neutral", text: "This exact file was already in DocForge; it is not read again." }
        : { word: "Ready", kind: "ok", text: "Read and checked. Ready to review." };
    case "failed":
      return { word: "Failed", kind: "fail", text: item.error ?? "It could not be read." };
    case "split":
      return { word: "Split", kind: "ok", text: "It held several invoices: each is its own document now." };
    case "split_review":
      return { word: "Group pages", kind: "warn", text: "It holds several invoices; confirm how its pages group." };
    case "deleted":
      return { word: "Deleted", kind: "neutral", text: "Its document was deleted." };
    default:
      return { word: item.state, kind: "neutral", text: "" };
  }
}

/** Run `send` over `items`, `limit` at a time; never rejects (each send handles its own). */
export async function pool<T>(items: T[], limit: number, send: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const item = items[next++];
      await send(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

export function createBatch(files: number, docType: string): Promise<Batch> {
  return api<Batch>("/batches", { method: "POST", json: { files, doc_type: docType } });
}

export function sendFile(batchId: string, file: File, onProgress: (fraction: number) => void): Promise<Uploaded<BatchItem>> {
  const form = new FormData();
  form.append("file", file);
  return upload<BatchItem>(`/batches/${encodeURIComponent(batchId)}/files`, form, onProgress);
}

export function sendZip(file: File, docType: string, onProgress: (fraction: number) => void): Promise<Uploaded<Batch>> {
  const form = new FormData();
  form.append("file", file);
  form.append("doc_type", docType);
  return upload<Batch>("/batches/zip", form, onProgress);
}

export function getBatch(id: string): Promise<Batch> {
  return api<Batch>(`/batches/${encodeURIComponent(id)}`);
}

export function listBatches(): Promise<BatchSummary[]> {
  return api<BatchSummary[]>("/batches");
}

/** Read again the batch's files whose reading failed; nothing else. */
export function retryFailed(id: string): Promise<Batch> {
  return api<Batch>(`/batches/${encodeURIComponent(id)}/retry`, { method: "POST" });
}
