"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Alert } from "@/components/ui";
import { ApiError, api } from "@/lib/api";

export type Settings = { near_expiry_months: number; updated_by: string | null; updated_at: string | null };

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
