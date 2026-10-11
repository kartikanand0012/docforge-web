"use client";

import { useState, type FormEvent } from "react";
import { Dialog } from "@/components/Dialog";
import { useCaller } from "@/components/Shell";
import { Alert } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { useTitle } from "@/lib/useTitle";

export default function AccountPage() {
  useTitle("Your account");
  const caller = useCaller();
  const [asking, setAsking] = useState(false);
  const own = caller.role === "member" && caller.workspace === "personal";

  return (
    <div className="screen">
      <header className="screen-header">
        <div>
          <h1>Your account</h1>
          <p className="sub">Who you are signed in as, and what happens to your documents.</p>
        </div>
      </header>
      <div className="screen-body" style={{ maxWidth: 720 }}>
        <dl className="account-facts">
          <div>
            <dt>Name</dt>
            <dd>{caller.name || "—"}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{caller.email ?? "—"}</dd>
          </div>
          <div>
            <dt>Workspace</dt>
            <dd>{caller.organisation || "—"}</dd>
          </div>
          <div>
            <dt>Signs with</dt>
            <dd>{caller.credential === "password" ? "Your password" : "A PIN"}</dd>
          </div>
        </dl>

        {own ? (
          <section className="panel" aria-labelledby="delete-account" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <h2 id="delete-account" style={{ fontSize: 18 }}>
              Delete your account
            </h2>
            <p>
              Deletes your workspace and everything in it for good: every document and its stored file, the values read from it, your
              corrections and signatures, conversations, knowledge bases and the workspace&apos;s audit trail. It cannot be undone. You can
              sign up again with the same email afterwards, starting empty.
            </p>
            <button className="btn btn-secondary btn-danger" style={{ alignSelf: "flex-start" }} onClick={() => setAsking(true)}>
              Delete my account…
            </button>
          </section>
        ) : (
          <p className="muted">This account belongs to an organisation; its administrator manages it.</p>
        )}
      </div>
      {asking && <DeleteAccount onClose={() => setAsking(false)} />}
    </div>
  );
}

function DeleteAccount({ onClose }: { onClose: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!password) return setError("Enter your password to confirm.");
    setBusy(true);
    setError(null);
    try {
      await api(`/accounts/current`, { method: "DELETE", json: { password } });
    } catch (caught) {
      setPassword("");
      setBusy(false);
      if (caught instanceof ApiError && caught.status === 401) return setError("That password is not right.");
      if (caught instanceof ApiError && caught.status === 429) return setError("Too many wrong tries. Try again in 15 minutes.");
      return setError(caught instanceof ApiError ? caught.detail : "Your account was not deleted. Try again.");
    }
    // The account is gone; the cookie goes too, and a full load starts from the landing page.
    await fetch("/api/session", { method: "DELETE" }).catch(() => undefined);
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/");
  };

  return (
    <Dialog title="Delete your account?" role="alertdialog" onClose={onClose} width={460} dismissable={!busy}>
      <form onSubmit={submit} noValidate style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <p>Everything in your workspace is erased. This cannot be undone.</p>
        <div className="field">
          <label htmlFor="delete-password">Your password</label>
          <input
            id="delete-password"
            className="input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "delete-error" : undefined}
            autoFocus
            maxLength={128}
          />
        </div>
        {error && (
          <Alert kind="fail" title="Not deleted.">
            <span id="delete-error">{error}</span>
          </Alert>
        )}
        <div className="dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary btn-danger" disabled={busy}>
            {busy ? "Deleting…" : "Delete everything"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
