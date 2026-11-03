"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Alert, StatusBadge } from "@/components/ui";
import { saveFile } from "@/lib/exports";
import { count, money } from "@/lib/format";
import {
  STATUS_WORDS, TOTALS, cellOf, checkTwoB, differencesOf, emptySentence, fetchRegisterFile, getRegister, indiaMonth, isMoneyColumn,
  monthWords, registerDay, sentenceOf, type CheckStatus, type CheckedRow, type Register, type TwoBCheck,
} from "@/lib/register";  // prettier-ignore

const FIRST_ROWS = 100; // a busy month has thousands: the file holds them all
const BADGE: Record<CheckStatus, "ok" | "warn" | "info"> = { matched: "ok", amount_differs: "warn", docforge_only: "info" };

/** A month's approved invoices, one row each, as an Excel file for the CA. The count and totals
 * shown are the file's; a 2B check marks each row beside the GSTR-2B download chosen, and the
 * file then carries a "2B check" sheet too. */
export function PurchaseRegister({ now }: { now?: Date }) {
  const [initialMonth] = useState(() => indiaMonth(now));
  const [month, setMonth] = useState(initialMonth);
  const [supplier, setSupplier] = useState("");
  const [register, setRegister] = useState<Register | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [twobFile, setTwobFile] = useState<File | null>(null);
  const [check, setCheck] = useState<TwoBCheck | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [empty, setEmpty] = useState<string | null>(null); // the API's sentence for a month with nothing in it
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const asked = useRef(0);
  const id = useId();

  const runCheck = async (file: File, shown: Register) => {
    setChecking(true);
    setCheckError(null);
    setCheck(null);
    try {
      setCheck(await checkTwoB(file, shown.month, shown.supplier_gstin));
    } catch (caught) {
      // A file the API cannot read would refuse the download too: it is set aside.
      setCheckError(sentenceOf(caught, "The 2B file could not be compared. Try again."));
      setTwobFile(null);
      if (fileInput.current) fileInput.current.value = "";
    } finally {
      setChecking(false);
    }
  };

  const load = async (which: string, who: string, file: File | null) => {
    const ask = ++asked.current;
    setLoading(true);
    setError(null);
    setEmpty(null);
    setCheck(null);
    setCheckError(null);
    setDownloadError(null);
    setShowAll(false);
    try {
      const found = await getRegister(which, who);
      if (ask !== asked.current) return;
      setRegister(found);
      if (file && found.invoices > 0) void runCheck(file, found);
    } catch (caught) {
      if (ask !== asked.current) return;
      setRegister(null);
      setError(sentenceOf(caught, "The register could not be loaded. Try again."));
    } finally {
      if (ask === asked.current) setLoading(false);
    }
  };

  useEffect(() => {
    // Only the first month is loaded unasked; after that, Show register.
    const ask = ++asked.current;
    getRegister(initialMonth).then(
      (found) => ask === asked.current && setRegister(found),
      (caught: unknown) => ask === asked.current && setError(sentenceOf(caught, "The register could not be loaded. Try again.")),
    ).finally(() => ask === asked.current && setLoading(false));
  }, [initialMonth]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!/^\d{4}-\d{2}$/.test(month)) return setError("Choose a month.");
    void load(month, supplier, twobFile);
  };

  const chooseTwoB = (file: File | null) => {
    setTwobFile(file);
    setCheck(null);
    setCheckError(null);
    if (file && register && register.invoices > 0) void runCheck(file, register);
  };

  const download = async () => {
    if (!register || downloading) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      const result = await fetchRegisterFile(register.month, register.supplier_gstin, twobFile);
      if (result.kind === "empty") setEmpty(result.detail);
      else saveFile(result.blob, result.filename);
    } catch (caught) {
      setDownloadError(sentenceOf(caught, "The file could not be made. Try again."));
    } finally {
      setDownloading(false);
    }
  };

  const nothing = register !== null && (register.invoices === 0 || empty !== null);
  const marks = new Map<string, CheckedRow>((check?.rows ?? []).map((row) => [row.document_id, row]));
  const rows = register ? (showAll ? register.rows : register.rows.slice(0, FIRST_ROWS)) : [];
  const gstins = register ? [...new Set(register.rows.map((row) => row.supplier_gstin).filter((g): g is string => Boolean(g)))].sort() : [];

  return (
    <section className="section-card" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} style={{ fontSize: 18 }}>
        Purchase Register (Excel)
      </h2>
      <p className="muted">
        A month&apos;s approved invoices, one row each, taken by their invoice date (India): an Excel file for your CA to set beside GSTR-2B.
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
            list={`${id}-gstins`}
            autoComplete="off"
            onChange={(e) => setSupplier(e.target.value.toUpperCase())}
          />
          <datalist id={`${id}-gstins`}>
            {gstins.map((gstin) => (
              <option key={gstin} value={gstin} />
            ))}
          </datalist>
        </div>
        <button type="submit" className="btn btn-secondary" disabled={loading}>
          Show register
        </button>
      </form>

      {loading && <p className="muted">Loading the register…</p>}
      {error && (
        <Alert kind="fail" title="Not loaded.">
          {error}
        </Alert>
      )}

      {register && !loading && (
        <>
          <p className="muted">{register.excluded}</p>
          {nothing ? (
            <Alert kind="info" title="No register to make.">
              {empty ?? emptySentence(register.month, register.supplier_gstin)}
            </Alert>
          ) : (
            <>
              <p>
                <strong>{register.invoices === 1 ? "1 invoice" : `${count(register.invoices)} invoices`}</strong> in {monthWords(register.month)}
                {register.supplier_gstin ? ` from ${register.supplier_gstin}` : ""}. These totals match the file.
              </p>
              <ul className="register-totals" aria-label="Totals">
                {TOTALS.map(({ key, label }) => (
                  <li key={key}>
                    <span className="muted">{label}</span>
                    <span className="stats-figure num">{money(register.totals[key])}</span>
                  </li>
                ))}
              </ul>

              <div className="register-twob">
                <h3 style={{ fontSize: 15 }}>2B check</h3>
                <p className="muted">
                  Choose the month&apos;s GSTR-2B download (Excel or JSON, at most 10 MB) to compare it with these invoices. Each row below is then marked.
                </p>
                <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <label htmlFor={`${id}-twob`} className="sr-only">
                    GSTR-2B file
                  </label>
                  <input
                    ref={fileInput}
                    id={`${id}-twob`}
                    type="file"
                    accept=".xlsx,.json,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    onChange={(e) => chooseTwoB(e.target.files?.[0] ?? null)}
                  />
                  {twobFile && (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => {
                        chooseTwoB(null);
                        if (fileInput.current) fileInput.current.value = "";
                      }}
                    >
                      Remove the 2B file
                    </button>
                  )}
                </div>
                {checking && <p className="muted">Comparing…</p>}
                {checkError && (
                  <Alert kind="fail" title="Not compared.">
                    {checkError}
                  </Alert>
                )}
                {check && (
                  <div aria-label="2B check summary" role="group" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <p style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <StatusBadge kind="ok">Matched: {count(check.matched)}</StatusBadge>
                      <StatusBadge kind="warn">Amount differs: {count(check.amount_differs)}</StatusBadge>
                      <StatusBadge kind="info">In DocForge only: {count(check.docforge_only)}</StatusBadge>
                      <StatusBadge kind="info">In 2B only: {count(check.twob_only)}</StatusBadge>
                    </p>
                    <p className="muted">{check.note}</p>
                  </div>
                )}
              </div>

              <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <button type="button" className="btn btn-primary" onClick={() => void download()} disabled={downloading}>
                  {downloading ? "Making the file…" : "Download Excel"}
                </button>
                <span className="muted">
                  {twobFile
                    ? `The file includes a “2B check” sheet from ${twobFile.name}.`
                    : "Choose a GSTR-2B file above to add a “2B check” sheet to the file."}
                </span>
              </div>
              {downloadError && (
                <Alert kind="fail" title="Not downloaded.">
                  {downloadError}
                </Alert>
              )}

              <div className="table-wrap">
                <table className="table register-table">
                  <caption className="sr-only">
                    Purchase register for {monthWords(register.month)}
                  </caption>
                  <thead>
                    <tr>
                      {check && <th scope="col">2B check</th>}
                      {register.columns.map((column) => (
                        <th
                          key={column}
                          scope="col"
                          className={isMoneyColumn(column) ? "right" : undefined}
                          aria-describedby={column === "ITC Eligibility Note" ? `${id}-note-help` : undefined}
                        >
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const mark = marks.get(row.document_id);
                      return (
                        <tr key={row.document_id} data-status={mark?.status}>
                          {check && (
                            <td>
                              {mark ? (
                                <>
                                  <StatusBadge kind={BADGE[mark.status]}>{STATUS_WORDS[mark.status]}</StatusBadge>
                                  {differencesOf(mark).map((words) => (
                                    <span key={words} style={{ display: "block", fontSize: 12.5 }}>
                                      {words}
                                    </span>
                                  ))}
                                </>
                              ) : (
                                "—"
                              )}
                            </td>
                          )}
                          {register.columns.map((column) => (
                            <td key={column} className={isMoneyColumn(column) ? "right num" : column === "Invoice Date" ? "num" : undefined}>
                              {cellOf(column, row)}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {register.rows.length > rows.length && (
                <p className="muted" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  Showing {count(rows.length)} of {count(register.rows.length)}; the file has them all.
                  <button type="button" className="btn btn-ghost" onClick={() => setShowAll(true)}>
                    Show all {count(register.rows.length)}
                  </button>
                </p>
              )}
              <p id={`${id}-note-help`} className="muted">
                {register.note_help}
              </p>

              {check && check.twob_only_invoices.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <h3 id={`${id}-twob-only`} style={{ fontSize: 15 }}>
                    In 2B only
                  </h3>
                  <p className="muted">Invoices in the 2B file with no approved invoice in DocForge for {monthWords(register.month)}.</p>
                  <div className="table-wrap">
                    <table className="table" aria-labelledby={`${id}-twob-only`}>
                      <thead>
                        <tr>
                          <th scope="col">Supplier GSTIN</th>
                          <th scope="col">Trade name</th>
                          <th scope="col">Invoice Number</th>
                          <th scope="col">Invoice Date</th>
                          <th scope="col" className="right">
                            Taxable Value
                          </th>
                          <th scope="col" className="right">
                            Invoice Value
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {check.twob_only_invoices.map((invoice, index) => (
                          <tr key={`${index}|${invoice.supplier_gstin}|${invoice.invoice_no}`}>
                            <td className="num">{invoice.supplier_gstin}</td>
                            <td>{invoice.trade_name ?? "—"}</td>
                            <td>{invoice.invoice_no}</td>
                            <td className="num">{registerDay(invoice.invoice_date)}</td>
                            <td className="right num">{money(invoice.taxable_value)}</td>
                            <td className="right num">{money(invoice.invoice_value)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
