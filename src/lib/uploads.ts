/** Uploading (screen 5): what is refused before sending, and the server's refusals turned
 * into what to do next. The server's answer is always final. */

import { bytes } from "@/lib/format";

export const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPTED = new Set(["pdf", "docx", "xlsx", "pptx", "png", "jpg", "jpeg", "tif", "tiff"]);
const OLDER: Record<string, string> = { doc: "docx", xls: "xlsx", ppt: "pptx" };
const TYPE_WORDS: Record<string, string> = { invoice: "an invoice", purchase_order: "an order", coa: "a certificate", general: "a general document" };

export type Refusal = { kind: "fail" | "warn"; word: string; text: string; retry?: boolean };

const extension = (name: string) => name.split(".").pop()?.toLowerCase() ?? "";
const tooLarge = (size: number) => `Larger than 10 MB (${bytes(size)}). Compress it or split it and upload again.`;

export function clientCheck(file: { name: string; size: number }): string | null {
  const ext = extension(file.name);
  if (OLDER[ext]) return `Older Office file (.${ext}). Save it as .${OLDER[ext]} and upload it again.`;
  if (!ACCEPTED.has(ext)) return "This file type is not accepted. Use PDF, DOCX, XLSX, PPTX, PNG, JPEG or TIFF.";
  if (file.size > MAX_BYTES) return tooLarge(file.size);
  return null;
}

export function refusal(status: number, detail: string, file: { name: string; size: number }): Refusal {
  const refused = (text: string): Refusal => ({ kind: "fail", word: "Refused", text });
  const lower = detail.toLowerCase();
  if (status === 503) {
    const text = lower.includes("storage")
      ? "Storage is unavailable right now. Nothing was stored; try again in a minute."
      : "The reading queue is full right now. Nothing was stored; try again in a minute.";
    return { kind: "warn", word: "Not sent", text, retry: true };
  }
  if (status === 422 && lower.includes("password")) return refused("Protected by a password. Remove the password and upload it again.");
  if (status === 415 && lower.includes("older office")) {
    const ext = extension(file.name);
    const modern = OLDER[ext] ?? (ACCEPTED.has(ext) && ext !== "pdf" ? ext : "docx");
    return refused(`Older Office file, or one protected by a password. Save it as .${modern} without a password, or as a PDF, and upload it again.`);
  }
  if (status === 415) return refused("This file type is not accepted. Use PDF, DOCX, XLSX, PPTX, PNG, JPEG or TIFF.");
  if (status === 413) {
    const pages = /has (\d+) pages; the limit is (\d+)/i.exec(detail);
    if (pages) return refused(`Has ${pages[1]} pages; the limit is ${pages[2]}. Split it and upload the parts.`);
    return refused(tooLarge(file.size));
  }
  if (status === 409) {
    const type = /document type '([a-z_]+)'/.exec(detail)?.[1];
    return refused(type ? `This file is already stored as ${TYPE_WORDS[type] ?? type}.` : detail);
  }
  return refused(detail);
}
