"use client";

import { AlertTriangle, Check, GitCompare, X } from "lucide-react";
import Link from "next/link";
import { Marks, ReasonLine, StatusBadge, Time } from "@/components/ui";
import { label as fieldLabel } from "@/lib/fields";
import type { Review } from "@/lib/review";
import { stageKind, stageWord } from "@/lib/stages";

export type TimelineStep = { stage: string; at: string; detail?: string | null };
export type AuditEntry = { id: number; occurred_at: string; actor: string; action: string; details?: Record<string, unknown> };

export function OrderTab({ review }: { review: Review }) {
  const status = review.match_status;
  if (status === "no_counterpart" || (!review.counterpart_document_id && status !== "match" && status !== "mismatch")) {
    return (
      <div className="tab-body">
        <ReasonLine kind="info" label="Not linked yet" text="There is no purchase order on file to compare it with. Upload the order and it is matched by its number." box />
      </div>
    );
  }
  const errors = review.discrepancies.filter((item) => item.severity === "error");
  return (
    <div className="tab-body">
      <p style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        {status === "mismatch" ? (
          <StatusBadge kind="fail" icon={GitCompare}>Does not match its order</StatusBadge>
        ) : (
          <StatusBadge kind="ok" icon={Check}>Matches its order</StatusBadge>
        )}
        {review.counterpart_document_id && (
          <span>
            Matched with <Link href={`/documents/${review.counterpart_document_id}`}>its purchase order</Link> by order number
          </span>
        )}
      </p>
      {review.discrepancies.length > 0 ? (
        <div className="table-wrap">
          <table className="table num" style={{ fontSize: 13, minWidth: 460 }}>
            <thead>
              <tr>
                <th scope="col">What</th>
                <th scope="col" className="right">Ordered</th>
                <th scope="col" className="right">Billed</th>
                <th scope="col">Result</th>
              </tr>
            </thead>
            <tbody>
              {review.discrepancies.map((item, index) => (
                <tr key={index}>
                  <td>{fieldLabel(item.invoice_path ?? item.order_path ?? item.code)}</td>
                  <td className="right">{item.order_value ?? "—"}</td>
                  <td className="right" style={{ fontWeight: 600, color: `var(--st-${item.severity === "error" ? "fail" : "warn"}-fg)` }}>
                    {item.invoice_value ?? "—"}
                  </td>
                  <td>
                    <span className={`reason reason-${item.severity === "error" ? "fail" : "warn"}`}>
                      {item.severity === "error" ? <X strokeWidth={1.5} aria-hidden="true" /> : <AlertTriangle strokeWidth={1.5} aria-hidden="true" />}
                      <span>{item.severity === "error" ? "Differs" : "Check"}</span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">Every line agrees with the order.</p>
      )}
      {errors.map((item, index) => (
        <ReasonLine key={index} kind="fail" label="Does not match its order" box text={`${item.message} Correct the value if the page was misread, or reject the invoice.`} />
      ))}
    </div>
  );
}

const CERTIFICATE = {
  within_limits: { kind: "ok" as const, word: "Within limits", text: "Every result is within its specification." },
  out_of_limit: { kind: "fail" as const, word: "Outside limits", text: "Some results are outside their limits." },
  unverified: { kind: "warn" as const, word: "Not fully checked", text: "Some results could not be checked against their limits." },
};

export function CertificatesTab({ review }: { review: Review }) {
  const batches = ((review.record.lines as Record<string, { raw?: string | null; value?: unknown }>[] | undefined) ?? [])
    .map((line) => line.batch_no?.raw ?? (line.batch_no?.value as string | undefined))
    .filter((batch): batch is string => Boolean(batch));
  const linked = new Set(review.certificates.map((certificate) => certificate.batch_no));
  const missing = batches.filter((batch) => !linked.has(batch));
  return (
    <div className="tab-body">
      <p className="muted">Certificates of analysis linked to this invoice by batch number.</p>
      {review.certificates.map((certificate) => {
        const shown = CERTIFICATE[certificate.status as keyof typeof CERTIFICATE] ?? CERTIFICATE.unverified;
        return (
          <div key={certificate.document_id} className="cert-card marked">
            <Marks />
            <p className="group-label" style={{ fontSize: 11 }}>Batch {certificate.batch_no}</p>
            <ReasonLine kind={shown.kind === "ok" ? "info" : shown.kind} label={shown.word} text={shown.text} />
            <Link className="btn btn-secondary" href={`/documents/${certificate.document_id}`} style={{ alignSelf: "flex-start" }}>
              Open certificate
            </Link>
          </div>
        );
      })}
      {missing.length > 0 && (
        <div className="dashed-box">
          No certificate yet for batch{missing.length > 1 ? "es" : ""} {missing.join(", ")}. They link here when uploaded.
        </div>
      )}
      {!review.certificates.length && !missing.length && <p className="muted">This document has no batches to link.</p>}
    </div>
  );
}

export function TimelineTab({ steps, live }: { steps: TimelineStep[]; live: boolean }) {
  return (
    <div className="tab-body">
      {live && (
        <p className="muted" role="status">
          Still being read; new stages appear here as they happen.
        </p>
      )}
      <ol className="timeline" aria-live={live ? "polite" : undefined}>
        {steps.map((step, index) => (
          <li key={`${step.stage}-${index}`}>
            {stageKind(step.stage) === "fail" ? (
              <X size={14} strokeWidth={1.5} aria-hidden="true" style={{ color: "var(--st-fail-fg)" }} />
            ) : (
              <Check size={14} strokeWidth={1.5} aria-hidden="true" style={{ color: "var(--st-ok-fg)" }} />
            )}
            <span style={{ fontWeight: 500 }}>{stageWord(step.stage)}</span>
            <span>
              <span className="num">
                <Time iso={step.at} seconds />
              </span>
              {step.detail && <span className="muted"> · {step.detail}</span>}
            </span>
          </li>
        ))}
      </ol>
      {!steps.length && <p className="muted">Nothing has happened to this document yet.</p>}
    </div>
  );
}

const ACTIONS: Record<string, string> = {
  "document.received": "Received",
  "document.processed": "Read and checked",
  "document.failed": "Could not be read",
  "document.reprocess_requested": "Asked to be read again",
  "review.corrected": "Value corrected",
  "review.signed": "Signed",
  "match.evaluated": "Matched with its order",
};

function who(actor: string): string {
  if (actor.startsWith("key:")) return "An API key";
  if (actor.startsWith("reviewer:")) return "A reviewer";
  if (actor.startsWith("system") || actor.startsWith("worker")) return "DocForge";
  return actor;
}

export function AuditTab({ entries }: { entries: AuditEntry[] }) {
  return (
    <div className="tab-body">
      <ol className="audit-trail">
        {entries.map((entry) => (
          <li key={entry.id}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <span style={{ fontWeight: 500 }}>{ACTIONS[entry.action] ?? entry.action}</span>
              <span className="muted num" style={{ fontSize: 12 }}>
                <Time iso={entry.occurred_at} seconds />
              </span>
            </div>
            <span className="muted" style={{ fontSize: 12 }}>
              {who(entry.actor)} · entry #{entry.id}
            </span>
          </li>
        ))}
      </ol>
      {!entries.length && <p className="muted">No entries yet.</p>}
    </div>
  );
}
