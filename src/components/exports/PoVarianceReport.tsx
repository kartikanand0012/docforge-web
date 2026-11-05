"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Alert } from "@/components/ui";
import { saveFile } from "@/lib/exports";
import { count, money } from "@/lib/format";
import { indiaMonth, monthWords, registerDay } from "@/lib/register";
import { fetchVarianceFile, getVarianceReport, sentenceOf, signedMoney, type VarianceReport } from "@/lib/variance";

/** A month's approved invoices against their purchase orders, by supplier: the pilot review's
 * number. The invoices that could not be checked (no PO linked, not approved yet, ...) are
 * counted and listed with their reasons, never left out. */
export function PoVarianceReport({ now }: { now?: Date }) {
  const [initialMonth] = useState(() => indiaMonth(now));
  const [month, setMonth] = useState(initialMonth);
  const [supplier, setSupplier] = useState("");
  const [report, setReport] = useState<VarianceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [empty, setEmpty] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const asked = useRef(0);
  const id = useId();

  const load = async (which: string, who: string) => {
    const ask = ++asked.current;
    setLoading(true);
    setError(null);
    setEmpty(null);
    try {
      const found = await getVarianceReport(which, who);
      if (ask === asked.current) setReport(found);
    } catch (caught) {
      if (ask !== asked.current) return;
      setReport(null);
      setError(sentenceOf(caught, "The report could not be loaded. Try again."));
    } finally {
      if (ask === asked.current) setLoading(false);
    }
  };

  useEffect(() => {
    const ask = ++asked.current;
    getVarianceReport(initialMonth)
      .then(
        (found) => ask === asked.current && setReport(found),
        (caught: unknown) => ask === asked.current && setError(sentenceOf(caught, "The report could not be loaded. Try again.")),
      )
      .finally(() => ask === asked.current && setLoading(false));
  }, [initialMonth]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!/^\d{4}-\d{2}$/.test(month)) return setError("Choose a month.");
    void load(month, supplier);
  };

  const download = async () => {
    if (!report || downloading) return;
    setDownloading(true);
    setError(null);
    try {
      const result = await fetchVarianceFile(report.month, report.supplier_gstin);
      if (result.kind === "empty") setEmpty(result.detail);
      else saveFile(result.blob, result.filename);
    } catch (caught) {
      setError(sentenceOf(caught, "The file could not be made. Try again."));
    } finally {
      setDownloading(false);
    }
  };

  const t = report?.totals;
  const nothing = report !== null && (empty !== null || (report.invoices.length === 0 && report.not_checked.length === 0));

  return (
    <section className="section-card" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} style={{ fontSize: 18 }}>
        PO Variance Report (Excel)
      </h2>
      <p className="muted">
        Each approved invoice of a month against the purchase order it was billed against: rate above the PO, quantity short, scheme goods not
        given, in rupees with the arithmetic shown. It informs you; it contacts no supplier.
      </p>

      <form onSubmit={submit} noValidate style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div className="field">
          <label htmlFor={`${id}-month`}>Month</label>
          <input id={`${id}-month`} className="input num" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor={`${id}-supplier`}>Supplier GSTIN (optional)</label>
          <input
            id={`${id}-supplier`}
            className="input num"
            value={supplier}
            maxLength={20}
            placeholder="All suppliers"
            autoComplete="off"
            onChange={(e) => setSupplier(e.target.value.toUpperCase())}
          />
        </div>
        <button type="submit" className="btn btn-secondary" disabled={loading}>
          Show report
        </button>
      </form>

      {loading && <p className="muted">Loading the report…</p>}
      {error && (
        <Alert kind="fail" title="Not done.">
          {error}
        </Alert>
      )}

      {report && t && !loading && (
        <>
          {nothing ? (
            <Alert kind="info" title="Nothing to compare.">
              {empty ?? `No invoice${report.supplier_gstin ? ` from ${report.supplier_gstin}` : ""} is dated in ${monthWords(report.month)}.`}
            </Alert>
          ) : (
            <>
              <ul className="register-totals" aria-label="Month's variance">
                <li>
                  <span className="muted">Invoices checked</span>
                  <span className="stats-figure num">{count(t.invoices_checked)}</span>
                </li>
                <li>
                  <span className="muted">Lines checked</span>
                  <span className="stats-figure num">{count(t.lines_checked)}</span>
                </li>
                <li>
                  <span className="muted">Variances found</span>
                  <span className="stats-figure num">{count(t.variances)}</span>
                </li>
                <li>
                  <span className="muted">Charged above PO</span>
                  <span className="stats-figure num">{money(t.above_po)}</span>
                </li>
                <li>
                  <span className="muted">Net money impact</span>
                  <span className="stats-figure num">{signedMoney(t.net_impact)}</span>
                </li>
              </ul>

              {report.suppliers.length > 0 && (
                <div className="table-wrap">
                  <table className="table num" style={{ fontSize: 13 }} aria-label="By supplier">
                    <thead>
                      <tr>
                        <th scope="col">Supplier</th>
                        <th scope="col" className="right">Invoices</th>
                        <th scope="col" className="right">Lines</th>
                        <th scope="col" className="right">Variances</th>
                        <th scope="col" className="right">Above PO</th>
                        <th scope="col" className="right">Net</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.suppliers.map((s) => (
                        <tr key={s.supplier_gstin ?? s.supplier_name ?? ""}>
                          <td>
                            {s.supplier_name ?? "—"} <span className="muted">{s.supplier_gstin}</span>
                          </td>
                          <td className="right">{count(s.invoices_checked)}</td>
                          <td className="right">{count(s.lines_checked)}</td>
                          <td className="right">{count(s.variances)}</td>
                          <td className="right">{money(s.above_po)}</td>
                          <td className="right">{signedMoney(s.net_impact)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <NotCheckedList report={report} />

              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <button type="button" className="btn btn-primary" disabled={downloading} onClick={() => void download()}>
                  {downloading ? "Making the file…" : "Download PO Variance Report (Excel)"}
                </button>
              </div>
              <p className="muted" style={{ fontSize: 12 }}>
                {report.sign_note} Tolerances: rate {money(report.tolerances.rate)} a unit, quantity {report.tolerances.qty}, free quantity{" "}
                {report.tolerances.free_qty}, taxable amount {money(report.tolerances.amount)} (Settings).
              </p>
            </>
          )}
        </>
      )}
    </section>
  );
}

function NotCheckedList({ report }: { report: VarianceReport }) {
  const n = report.not_checked.length;
  if (n === 0) return <p className="muted">Every invoice dated in the month was checked.</p>;
  return (
    <details>
      <summary>
        <strong>Not checked: {n === 1 ? "1 invoice" : `${count(n)} invoices`}</strong> <span className="muted">(listed in the file too)</span>
      </summary>
      <ul style={{ paddingLeft: 18, fontSize: 13, marginTop: 6 }}>
        {report.not_checked.map((item) => (
          <li key={item.document_id}>
            <Link href={`/documents/${item.document_id}`}>{item.invoice_no ?? "Invoice"}</Link>
            {item.invoice_date ? ` · ${registerDay(item.invoice_date)}` : ""}
            {item.supplier_name ? ` · ${item.supplier_name}` : ""} · <span>{item.reason}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
