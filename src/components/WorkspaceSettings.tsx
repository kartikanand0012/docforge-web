"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Alert } from "@/components/ui";
import { ApiError, api } from "@/lib/api";

export type Tolerances = { rate: string; qty: number; free_qty: number; amount: string };
export type Settings = { near_expiry_months: number; variance_tolerances?: Tolerances; updated_by: string | null; updated_at: string | null };

/** The workspace's own choices: read by anyone in it, changed by its administrator (or a
 * personal workspace's person). */
export function WorkspaceSettings({ mayChange }: { mayChange: boolean }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [months, setMonths] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let live = true;
    api<Settings>("/settings")
      .then((loaded) => {
        if (!live) return;
        setSettings(loaded);
        setMonths(String(loaded.near_expiry_months));
      })
      .catch(() => live && setLoadFailed(true));
    return () => {
      live = false;
    };
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const value = Number(months);
    if (!/^\d+$/.test(months.trim()) || value > 36) return setError("Enter a whole number of months from 0 to 36.");
    // Nothing to change, so nothing to record in the audit trail.
    if (value === settings?.near_expiry_months) return setSaved(true);
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const changed = await api<Settings>("/settings", { method: "PATCH", json: { near_expiry_months: value } });
      setSettings(changed);
      setMonths(String(changed.near_expiry_months));
      setSaved(true);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.detail : "The setting was not saved. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const current = settings?.near_expiry_months;
  return (
    <section className="panel" aria-labelledby="workspace-settings" style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
      <h2 id="workspace-settings" style={{ fontSize: 18 }}>
        Workspace settings
      </h2>
      <p>
        Near-expiry stock: a bill line that expires within this many months of the bill date is flagged on the bill. It is a flag, not a hold:
        approving needs nothing more. 0 turns it off.
      </p>
      {settings === null && !loadFailed && <p className="muted">Loading…</p>}
      {loadFailed && <p className="muted">The workspace&apos;s settings could not be loaded. Reload to try again.</p>}
      {settings !== null && !mayChange && (
        <p>
          <b>{current === 0 ? "Off" : `${current} ${current === 1 ? "month" : "months"}`}</b>
          <span className="muted"> · only an administrator can change it</span>
        </p>
      )}
      {settings !== null && mayChange && (
        <form onSubmit={submit} noValidate style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div className="field">
            <label htmlFor="near-expiry-months">Flag stock expiring within (months)</label>
            <input
              id="near-expiry-months"
              className="input num"
              inputMode="numeric"
              value={months}
              onChange={(e) => {
                setMonths(e.target.value);
                setSaved(false);
                setError(null);
              }}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "settings-error" : undefined}
              style={{ width: 120 }}
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </button>
        </form>
      )}
      {settings?.variance_tolerances && (
        <ToleranceForm tolerances={settings.variance_tolerances} mayChange={mayChange} onSaved={(changed) => setSettings(changed)} />
      )}
      {settings?.updated_by && (
        <p className="muted" style={{ fontSize: 12 }}>
          Last changed by {settings.updated_by}
          {settings.updated_at ? ` on ${new Date(settings.updated_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}` : ""}.
        </p>
      )}
      {/* Mounted throughout, so a screen reader announces the text when it arrives. */}
      <p role="status" className="muted">
        {saved ? "Saved. Bills in review use it now; bills already read keep theirs until they are read again." : ""}
      </p>
      {error && (
        <Alert kind="fail" title="Not saved.">
          <span id="settings-error">{error}</span>
        </Alert>
      )}
    </section>
  );
}

const RUPEES = /^\d{1,6}(\.\d{1,2})?$/;
const UNITS = /^\d{1,6}$/;
const TOLERANCE_FIELDS = [
  { key: "rate", label: "Rate (₹ a unit)", pattern: RUPEES },
  { key: "qty", label: "Quantity (units)", pattern: UNITS },
  { key: "free_qty", label: "Free quantity (units)", pattern: UNITS },
  { key: "amount", label: "Taxable amount (₹)", pattern: RUPEES },
] as const;

/** How far a bill may differ from its PO and still be shown as matched, with a note, so the
 * variance does not cry wolf on rounding. Exact by default; a taxable amount within ₹1. */
function ToleranceForm({ tolerances, mayChange, onSaved }: { tolerances: Tolerances; mayChange: boolean; onSaved: (s: Settings) => void }) {
  const [values, setValues] = useState<Record<string, string>>(() => ({
    rate: tolerances.rate, qty: String(tolerances.qty), free_qty: String(tolerances.free_qty), amount: tolerances.amount,
  }));  // prettier-ignore
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const bad = TOLERANCE_FIELDS.find((f) => !f.pattern.test(values[f.key].trim()));
    if (bad) return setError(`${bad.label}: enter ${bad.pattern === UNITS ? "a whole number" : "rupees, to the paisa"}, 0 or more.`);
    const changed = Object.fromEntries(
      TOLERANCE_FIELDS.filter((f) => Number(values[f.key]) !== Number(tolerances[f.key])).map((f) => [
        f.key,
        f.pattern === UNITS ? Number(values[f.key]) : Number(values[f.key]).toFixed(2),
      ]),
    );
    if (Object.keys(changed).length === 0) return setSaved(true);
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      onSaved(await api<Settings>("/settings", { method: "PATCH", json: { variance_tolerances: changed } }));
      setSaved(true);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.detail : "The tolerances were not saved. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
      <h3 style={{ fontSize: 15 }}>PO variance tolerances</h3>
      <p>
        A bill that differs from its purchase order by no more than this is shown as matched, with a note, so rounding does not raise a variance.
        0 is exact.
      </p>
      {mayChange ? (
        <form onSubmit={submit} noValidate aria-label="PO variance tolerances" style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
          {TOLERANCE_FIELDS.map((f) => (
            <div className="field" key={f.key}>
              <label htmlFor={`tolerance-${f.key}`}>{f.label}</label>
              <input
                id={`tolerance-${f.key}`}
                className="input num"
                inputMode="decimal"
                value={values[f.key]}
                onChange={(e) => {
                  setValues((old) => ({ ...old, [f.key]: e.target.value }));
                  setSaved(false);
                  setError(null);
                }}
                style={{ width: 120 }}
              />
            </div>
          ))}
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "Saving…" : "Save tolerances"}
          </button>
        </form>
      ) : (
        <p>
          <b>
            Rate ₹{tolerances.rate} · quantity {tolerances.qty} · free quantity {tolerances.free_qty} · taxable amount ₹{tolerances.amount}
          </b>
          <span className="muted"> · only an administrator can change them</span>
        </p>
      )}
      <p role="status" className="muted">
        {saved ? "Saved. The variance on every bill and in the report uses them now." : ""}
      </p>
      {error && (
        <Alert kind="fail" title="Not saved.">
          {error}
        </Alert>
      )}
    </div>
  );
}
