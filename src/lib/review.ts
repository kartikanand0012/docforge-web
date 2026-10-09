/** The document view's model: ReviewOut (GET /v1/documents/{id}/review) turned into the
 * values a person checks, each with its checks in words and its boxes on the page. */

import { fieldAt, label } from "@/lib/fields";
import type { Box } from "@/lib/geometry";
import { classify } from "@/lib/reasons";

export type PageInfo = { number: number; width: number; height: number };
export type FieldAssessment = { path: string; status: string; needs_review: boolean; reasons: string[]; boxes: Box[]; found_in: string[] };
export type Rule = { rule_id: string; version: number; severity: string; outcome: string; message: string; paths: string[] };
export type Correction = { path: string; old_text: string | null; new_text: string | null; reason: string; reviewer_name: string; created_at: string };
export type Signed = {
  outcome: string; meaning: string; reason: string; override_reason: string | null;
  reviewer_name: string; signed_at: string; record_sha256: string; draft?: Record<string, unknown> | null;
};  // prettier-ignore
export type Discrepancy = {
  code: string; severity: "error" | "warning"; message: string;
  invoice_path: string | null; order_path: string | null; invoice_value: string | null; order_value: string | null;
};  // prettier-ignore
export type Certificate = { batch_no: string; document_id: string; status: string };

export type Review = {
  document_id: string;
  doc_type: string;
  filename: string;
  version_no: number;
  page_count: number;
  pages: PageInfo[];
  decision: string;
  blockers: string[];
  record: Record<string, unknown>;
  assessment: { decision: string; reasons: string[]; fields: FieldAssessment[]; rules: Rule[]; issues: unknown[] };
  editable_paths: string[];
  corrections: Correction[];
  match_status: string;
  discrepancies: Discrepancy[];
  counterpart_document_id: string | null;
  review: Signed | null;
  signature_valid: boolean | null;
  record_sha256: string;
  meanings: Record<string, string>;
  superseded: boolean;
  certificates: Certificate[];
};

export type FieldStatus = "passed" | "uncertain" | "failed" | "corrected";
export type Check = { kind: "ok" | "warn" | "fail" | "info"; word: "Passed" | "Uncertain" | "Failed" | "Corrected"; text: string };
export type FieldView = {
  path: string;
  label: string;
  group: string;
  display: string;
  status: FieldStatus;
  checks: Check[];
  boxes: Box[];
  flagged: boolean;
  editable: boolean;
};

const GROUPS: Record<string, string[]> = {
  invoice: ["Parties", "Invoice", "Lines", "Totals"],
  purchase_order: ["Parties", "Order", "Lines"],
  coa: ["Certificate", "Tests"],
};

export function groupOf(path: string, docType: string): string {
  const first = path.split(/[.[]/)[0];
  if (first === "lines") return "Lines";
  if (first === "tests") return "Tests";
  if (first === "totals") return "Totals";
  if (["seller", "buyer", "supplier"].includes(first) || first.startsWith("supplier_") || first === "buyer_name") return "Parties";
  if (docType === "purchase_order") return "Order";
  if (docType === "coa") return "Certificate";
  return "Invoice";
}

export function groupOrder(docType: string): string[] {
  return GROUPS[docType] ?? ["Details"];
}

const sentence = (text: string) => {
  const trimmed = text.trim();
  const capital = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  return /[.!?]$/.test(capital) ? capital : `${capital}.`;
};

function display(value: unknown): string {
  const field = value as { value?: unknown; raw?: string | null } | undefined;
  if (!field) return "—";
  // Shown as printed, unless the value is only part of what was printed: one string can hold
  // two values ("Gujarat (24)" is the place and its code).
  if (typeof field.value === "string" && field.value && field.raw && field.raw !== field.value && field.raw.includes(field.value)) return field.value;
  if (field.raw) return field.raw;
  if (field.value === null || field.value === undefined || field.value === "") return "—";
  return String(field.value);
}

/** Every value of the record, with what was found about it. Corrected outranks a failed
 * check (a person has spoken), a failed check outranks an uncertain reading. */
export function buildFields(review: Review): FieldView[] {
  const assessed = new Map(review.assessment.fields.map((field) => [field.path, field]));
  const paths = [...new Set([...review.assessment.fields.map((field) => field.path), ...review.editable_paths])];
  const signed = review.review !== null;
  return paths.map((path) => {
    const assessment = assessed.get(path);
    const corrections = review.corrections.filter((correction) => correction.path === path);
    const failed = review.assessment.rules.filter((rule) => rule.outcome === "failed" && rule.paths.includes(path));
    const checks: Check[] = [];
    const latest = corrections.at(-1);
    if (latest) {
      checks.push({
        kind: "info",
        word: "Corrected",
        text: `by ${latest.reviewer_name} from ${latest.old_text ?? "nothing"}. ${latest.reason}`.trim(),
      });
    }
    for (const rule of failed) checks.push({ kind: "fail", word: "Failed", text: rule.message });
    if (assessment?.needs_review) {
      for (const reason of assessment.reasons) checks.push({ kind: "warn", word: "Uncertain", text: sentence(reason) });
    }
    if (!checks.length && assessment) checks.push({ kind: "ok", word: "Passed", text: "Found where it says on the page." });
    const status: FieldStatus = latest ? "corrected" : failed.length ? "failed" : assessment?.needs_review ? "uncertain" : "passed";
    return {
      path,
      label: label(path),
      group: groupOf(path, review.doc_type),
      display: display(fieldAt(review.record, path)),
      status,
      checks,
      boxes: assessment?.boxes ?? [],
      flagged: status === "failed" || status === "uncertain",
      editable: !signed && review.editable_paths.includes(path),
    };
  });
}

export type BlockerTarget = { path: string } | { tab: "order" | "certificates" } | null;

/** Where a blocker is answered: the first value it is about, or the tab that explains it. */
export function blockerTarget(blocker: string, fields: FieldView[]): BlockerTarget {
  const reason = classify(blocker);
  const lower = blocker.toLowerCase();
  if (reason.label === "Does not match its order" || reason.label === "Not linked yet") return { tab: "order" };
  if (lower.includes("certificate")) return { tab: "certificates" };
  const wanted: FieldStatus = reason.label === "Check failed" ? "failed" : "uncertain";
  const field = fields.find((candidate) => candidate.status === wanted) ?? fields.find((candidate) => candidate.flagged);
  return field ? { path: field.path } : null;
}

export function blockerKind(blocker: string): ReturnType<typeof classify> {
  return classify(blocker);
}
