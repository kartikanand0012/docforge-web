"use client";

import { useId, useRef, useState, type ChangeEvent } from "react";
import { Alert } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { importMasters, importSummary, type ImportReport } from "@/lib/mappings";

/** Names exported from Tally or Marg, kept only to offer as suggestions: none becomes a
 * mapping until someone confirms it. */
export function ImportMasters() {
  const [report, setReport] = useState<ImportReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const id = useId();

  const choose = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    setReport(null);
    try {
      setReport(await importMasters(file));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.detail : "The file was not imported. Try again.");
    } finally {
      setBusy(false);
      // The same file can be chosen again after it is fixed.
      if (input.current) input.current.value = "";
    }
  };

  return (
    <section className="section-card" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} style={{ fontSize: 18 }}>
        Your books&apos; names
      </h2>
      <p>
        Export your ledger and stock item lists from Tally or Marg as a CSV with the columns <span className="mono">name, type</span> and,
        for suppliers, <span className="mono">gstin</span> (optional). <span className="mono">type</span> is <span className="mono">supplier</span> or{" "}
        <span className="mono">item</span>. At most 20,000 rows (2 MB).
      </p>
      <p className="muted">
        Imported names are only offered as suggestions when you map a supplier or item. None becomes a mapping until someone confirms it.
      </p>
      <div className="field">
        <label htmlFor={`${id}-file`}>Import names from Tally / Marg (CSV)</label>
        <input ref={input} id={`${id}-file`} type="file" accept=".csv,text/csv" onChange={(event) => void choose(event)} disabled={busy} />
      </div>
      <div aria-live="polite">
        {busy && <p className="muted">Importing…</p>}
        {report && <ImportReportView report={report} />}
      </div>
      {error && (
        <Alert kind="fail" title="Not imported.">
          {error}
        </Alert>
      )}
    </section>
  );
}

export function ImportReportView({ report }: { report: ImportReport }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <p>
        <b>{importSummary(report)}</b>
      </p>
      {report.rejected.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <caption className="sr-only">Rows not imported</caption>
            <thead>
              <tr>
                <th scope="col" className="right">
                  Line
                </th>
                <th scope="col">Why it was not imported</th>
              </tr>
            </thead>
            <tbody>
              {report.rejected.map((row) => (
                <tr key={row.line}>
                  <td className="right num">{row.line}</td>
                  <td>{row.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
