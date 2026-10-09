"use client";

import { useEffect, useState } from "react";
import { Alert, Marks, StatusBadge } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { count } from "@/lib/format";

type Evals = {
  extraction?: { model?: string; documents?: number; documents_fully_correct?: number; fields_correct?: number; fields_total?: number; citation_accuracy?: number; latency_ms_p50?: number; latency_ms_p95?: number; input_tokens_per_document?: number; output_tokens_per_document?: number };
  cost?: { per_document_usd?: number | null };
  trust?: { clean_pairs?: number; clean_pairs_accepted?: number; seeded_cases?: number; seeded_cases_caught?: number; seeded_findings_expected?: number; seeded_findings_caught?: number };
  scans?: Record<string, { source?: string; fields_correct?: number; fields_total?: number; silent_errors?: number; silent_errors_after_order_match?: number }>;
  multipage?: { documents?: number; documents_fully_correct?: number; fields_correct?: number; fields_total?: number; pages?: number };
};

const percent = (part = 0, whole = 0) => (whole ? `${((part / whole) * 100).toFixed(part === whole ? 0 : 1)}%` : "—");

function Metric({ label, figure, sub, badge }: { label: string; figure: string; sub: string; badge?: { kind: "ok" | "warn" | "fail" | "neutral"; word: string } }) {
  return (
    <div className="metric marked">
      <Marks />
      <p className="muted" style={{ fontSize: 12.5 }}>{label}</p>
      <p className="metric-figure num">{figure}</p>
      <p className="muted num" style={{ fontSize: 12.5 }}>{sub}</p>
      {badge && <StatusBadge kind={badge.kind}>{badge.word}</StatusBadge>}
    </div>
  );
}

export default function EvalsPage() {
  const [evals, setEvals] = useState<Evals | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<Evals>("/evals").then(setEvals, (caught: unknown) => setError(caught instanceof ApiError ? caught.detail : "The figures could not be loaded."));
  }, []);

  const x = evals?.extraction;
  const t = evals?.trust;
  const poor = evals?.scans?.scan_poor;
  const cost = evals?.cost?.per_document_usd;
  const suites: { name: string; cases: string; result: string; silent?: number }[] = evals
    ? [
        x && { name: "Invoices, born digital", cases: `${x.documents ?? 0} documents`, result: `${count(x.fields_correct ?? 0)} of ${count(x.fields_total ?? 0)} fields correct` },
        evals.multipage && { name: "Long documents", cases: `${evals.multipage.documents ?? 0} documents, ${evals.multipage.pages ?? 0} pages`, result: `${count(evals.multipage.fields_correct ?? 0)} of ${count(evals.multipage.fields_total ?? 0)} fields correct` },
        ...Object.entries(evals.scans ?? {}).map(([name, scan]) => ({
          name: name === "clean" ? "Text layer" : name === "scan_good" ? "Good scans (OCR)" : name === "scan_poor" ? "Poor scans (OCR)" : name,
          cases: scan.source === "ocr" ? "read by OCR" : "read from the text",
          result: `${count(scan.fields_correct ?? 0)} of ${count(scan.fields_total ?? 0)} fields correct`,
          silent: scan.silent_errors,
        })),
        t && { name: "Planted defects", cases: `${t.seeded_cases ?? 0} cases`, result: `${t.seeded_cases_caught ?? 0} of ${t.seeded_cases ?? 0} caught` },
      ].filter(Boolean) as { name: string; cases: string; result: string; silent?: number }[]
    : [];

  return (
    <div className="screen">
      <header className="screen-header">
        <div>
          <h1>Evals and cost</h1>
          <p className="sub">Measured, not claimed. Each figure comes from the latest run of the eval suites against labelled documents.</p>
        </div>
        {x?.model && <p className="muted mono" style={{ fontSize: 12.5 }}>{x.model}</p>}
      </header>
      <div className="screen-body">
        {error && <Alert kind="fail" title="Not loaded.">{error}</Alert>}
        {evals && (
          <>
            <div className="metrics">
              <Metric label="Fields correct" figure={percent(x?.fields_correct, x?.fields_total)} sub={`${count(x?.fields_correct ?? 0)} of ${count(x?.fields_total ?? 0)} labelled fields`} />
              <Metric
                label="Planted defects caught"
                figure={`${t?.seeded_cases_caught ?? 0} of ${t?.seeded_cases ?? 0}`}
                sub={`${t?.seeded_findings_caught ?? 0} of ${t?.seeded_findings_expected ?? 0} expected findings`}
                badge={t && t.seeded_cases_caught === t.seeded_cases ? { kind: "ok", word: "All caught" } : { kind: "fail", word: "Some missed" }}
              />
              <Metric
                label="Silent errors, poor scans"
                figure={String(poor?.silent_errors ?? 0)}
                sub={`${poor?.silent_errors_after_order_match ?? 0} left after matching with the order`}
                badge={poor && !poor.silent_errors_after_order_match ? { kind: "ok", word: "None reached a person unflagged" } : undefined}
              />
              <Metric
                label="Cost per document"
                figure={cost === null || cost === undefined ? "—" : `$${cost.toFixed(4)}`}
                sub={cost === null || cost === undefined ? "Not priced on this deployment" : `${count(x?.input_tokens_per_document ?? 0)} in, ${count(x?.output_tokens_per_document ?? 0)} out tokens`}
              />
            </div>
            <div className="table-wrap">
              <table className="table" style={{ minWidth: 640 }}>
                <thead>
                  <tr>
                    <th scope="col">Suite</th>
                    <th scope="col">Cases</th>
                    <th scope="col">Result</th>
                    <th scope="col" className="right">Silent errors</th>
                  </tr>
                </thead>
                <tbody>
                  {suites.map((suite) => (
                    <tr key={suite.name}>
                      <td style={{ fontWeight: 500 }}>{suite.name}</td>
                      <td>{suite.cases}</td>
                      <td className="num">{suite.result}</td>
                      <td className="right num">{suite.silent ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {x && (
              <p className="muted num" style={{ fontSize: 12.5 }}>
                Reading an invoice took {((x.latency_ms_p50 ?? 0) / 1000).toFixed(1)} s at the median and {((x.latency_ms_p95 ?? 0) / 1000).toFixed(1)} s at
                the 95th percentile. Every quote is checked against its page: {percent(Math.round((x.citation_accuracy ?? 0) * 1000), 1000)} pointed at the right text.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
