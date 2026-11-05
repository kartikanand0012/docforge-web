"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { MappingTasks } from "@/components/exports/MappingTasks";
import { Alert } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { checkProfile, checkSummary, parseIds, type CheckResult, type MargProfile } from "@/lib/profiles";

/** A profile's file for some approved bills, compared cell by cell with the file Marg accepted
 * for the same bills. Nothing is stored. */
export function CheckProfile({ profile, mayMap, onClose }: { profile: MargProfile; mayMap: boolean; onClose: () => void }) {
  const [ids, setIds] = useState("");
  const [result, setResult] = useState<CheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [round, setRound] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const id = useId();

  const check = async (event?: FormEvent) => {
    event?.preventDefault();
    if (busy) return;
    const file = input.current?.files?.[0];
    const documentIds = parseIds(ids);
    if (!file) return setError("Choose the import file Marg accepted.");
    if (!documentIds.length) return setError("Name the bills in that file by their document ids, in the file's order.");
    setBusy(true);
    setError(null);
    try {
      setResult(await checkProfile(profile.id, file, documentIds));
      setRound((current) => current + 1);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.detail : "The check did not run. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="section-card" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} style={{ fontSize: 18 }}>
        Check ‘{profile.name}’ against a file Marg accepted
      </h2>
      <p className="muted">
        Version {profile.latest.version_no} makes its file for the approved bills you name, and every cell is compared with the file your Marg
        accepted for them. Nothing is saved.
      </p>
      <form onSubmit={(event) => void check(event)} noValidate style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="field">
          <label htmlFor={`${id}-file`}>The import file Marg accepted (CSV or Excel, at most 2 MB)</label>
          <input ref={input} id={`${id}-file`} type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" />
        </div>
        <div className="field">
          <label htmlFor={`${id}-ids`}>The bills in that file (document ids, in the file&apos;s order)</label>
          <textarea id={`${id}-ids`} className="input mono" rows={3} value={ids} onChange={(e) => setIds(e.target.value)} placeholder="One per line, or separated by commas" />
          <span className="muted" style={{ fontSize: 12 }}>
            Approved bills only. A bill&apos;s id is the last part of its address in DocForge.
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "Checking…" : "Check"}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </form>
      {error && (
        <Alert kind="fail" title="Not checked.">
          {error}
        </Alert>
      )}
      {result && <CheckReport key={round} result={result} mayMap={mayMap} again={busy} onAgain={() => void check()} />}
    </section>
  );
}

export function CheckReport({ result, mayMap, again, onAgain }: { result: CheckResult; mayMap: boolean; again: boolean; onAgain: () => void }) {
  const compared = result.cells !== null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }} aria-live="polite">
      {!compared ? (
        <Alert kind="warn" title="Not compared.">
          {checkSummary(result)}
        </Alert>
      ) : result.exact ? (
        <Alert kind="ok" title="Exact: yes.">
          {checkSummary(result)} Version {result.version_no} wrote the same file for these {result.bills} bills.
        </Alert>
      ) : (
        <Alert kind="warn" title="Exact: no.">
          {checkSummary(result)}
        </Alert>
      )}
      {result.diffs.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <caption className="sr-only">Cells that differ</caption>
            <thead>
              <tr>
                <th scope="col" className="right">
                  Row
                </th>
                <th scope="col">Column</th>
                <th scope="col">Marg&apos;s file</th>
                <th scope="col">Ours</th>
              </tr>
            </thead>
            <tbody>
              {result.diffs.map((diff, index) => (
                <tr key={`${diff.row}-${diff.column}-${index}`}>
                  <td className="right num">{diff.row}</td>
                  <td>{diff.column}</td>
                  <td className="mono">{diff.expected || <span className="muted">(empty)</span>}</td>
                  <td className="mono">{diff.produced || <span className="muted">(empty)</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {result.diffs.length >= 200 && <p className="muted">The first 200 differences are shown.</p>}
      {result.tasks && (
        <MappingTasks tasks={result.tasks} books="marg" mayMap={mayMap} onRunAgain={onAgain} again={again} againLabel="Check again" />
      )}
    </div>
  );
}
