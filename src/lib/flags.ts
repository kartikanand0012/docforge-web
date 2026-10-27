/** What DocForge flagged on a bill, in words: the queue's badges, a near-expiry line's sentence,
 * and the home screen's count of what was caught. Near expiry and Schedule H1 are flags only:
 * they never hold a bill and never need an override; a possible duplicate does. */

import { label } from "@/lib/fields";

export type QueueFlags = { duplicates: number; near_expiry_lines: number; schedule_h1_lines: number };
export type FlagBadge = { kind: "fail" | "warn" | "info"; text: string };

/** A near-expiry line on ReviewOut.near_expiry: months_left counted from the bill date. */
export type NearExpiryLine = { path: string; product_name: string | null; batch_no: string | null; expiry: string; months_left: number };

/** GET /v1/flags/summary. `capped`: more invoices in the range than were counted. */
export type FlagsSummary = {
  from: string; to: string; invoices: number; duplicates: number; near_expiry_lines: number; near_expiry_bills: number;
  schedule_h1_lines: number; schedule_h1_bills: number; capped: boolean;
};  // prettier-ignore

const counted = (n: unknown) => (typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);
const months = (n: number) => `${n} ${n === 1 ? "month" : "months"}`;
export const plural = (n: number, one: string, many: string) => `${n.toLocaleString("en-IN")} ${n === 1 ? one : many}`;

/** The badges a queue row shows: only the flags raised, a count past one. Nothing from an
 * API before flags. */
export function queueBadges(flags: Partial<QueueFlags> | null | undefined): FlagBadge[] {
  const duplicates = counted(flags?.duplicates);
  const nearExpiry = counted(flags?.near_expiry_lines);
  const h1 = counted(flags?.schedule_h1_lines);
  const badges: FlagBadge[] = [];
  if (duplicates) badges.push({ kind: "fail", text: duplicates > 1 ? `Possible duplicate · ${duplicates} earlier bills` : "Possible duplicate" });
  if (nearExpiry) badges.push({ kind: "warn", text: nearExpiry > 1 ? `Near-expiry stock · ${nearExpiry} lines` : "Near-expiry stock" });
  if (h1) badges.push({ kind: "info", text: h1 > 1 ? `Schedule H1 · ${h1} lines` : "Schedule H1" });
  return badges;
}

/** "Batch B221 expires 2027-01, 3 months after the bill date (your window is 6 months)." By
 * batch, else product, else the line's number. */
export function nearExpirySentence(line: NearExpiryLine, window: number | undefined): string {
  const which = line.batch_no?.trim() ? `Batch ${line.batch_no.trim()}` : line.product_name?.trim() || label(line.path);
  const left = Math.max(0, Math.floor(line.months_left));
  const when = left === 0 ? "the same month as the bill" : `${months(left)} after the bill date`;
  return `${which} expires ${line.expiry}, ${when}${window ? ` (your window is ${months(window)})` : ""}.`;
}

/** "2 possible duplicates, 3 near-expiry lines and 1 Schedule H1 line". */
export function caughtList(summary: FlagsSummary): string {
  return [
    plural(summary.duplicates, "possible duplicate", "possible duplicates"),
    plural(summary.near_expiry_lines, "near-expiry line", "near-expiry lines"),
    plural(summary.schedule_h1_lines, "Schedule H1 line", "Schedule H1 lines"),
  ].reduce((text, part, index, parts) => (index === 0 ? part : `${text}${index === parts.length - 1 ? " and " : ", "}${part}`), "");
}

/** Today in India, as YYYY-MM-DD: the API counts days in India's time. */
export function indiaToday(now: Date = new Date()): string {
  return new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 10);
}

/** The last `days` days up to today in India, both ends included. */
export function lastDays(days: number, now: Date = new Date()): { from: string; to: string } {
  const to = indiaToday(now);
  const from = new Date(`${to}T00:00:00Z`);
  from.setUTCDate(from.getUTCDate() - (days - 1));
  return { from: from.toISOString().slice(0, 10), to };
}

/** "28 Sept 2026" from "2026-09-28". */
export function dayWords(date: string): string {
  const day = new Date(`${date}T00:00:00`);
  return Number.isNaN(day.getTime()) ? date : day.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
