"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Dialog } from "@/components/Dialog";
import { PinInput } from "@/components/PinInput";
import { Seg } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { label as fieldLabel } from "@/lib/fields";
import { hashGroups, localTime } from "@/lib/format";
import { rememberEmail, savedEmail } from "@/lib/reviewer";
import { blockerKind, type Review } from "@/lib/review";

type Outcome = "approved" | "rejected";

const NOUNS: Record<string, string> = { invoice: "invoice", purchase_order: "order", coa: "certificate" };

type Props = {
  review: Review;
  initial: Outcome;
  callerName: string;
  callerEmail: string | null;
  onClose: () => void;
  onSigned: () => void;
  onReload: (review: Review) => void;
};

/** An electronic signature (screen 3, sign dialog): a deliberate act bound to the record's
 * fingerprint. A record changed meanwhile is refused (409) and shown as such. */
export function SignDialog({ review, initial, callerName, callerEmail, onClose, onSigned, onReload }: Props) {
  const [outcome, setOutcome] = useState<Outcome>(initial);
  const [note, setNote] = useState("");
  const [override, setOverride] = useState("");
  const [pin, setPin] = useState("");
  const [email, setEmail] = useState(() => callerEmail ?? savedEmail());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [stale, setStale] = useState<Review | null>(null);
  const noun = NOUNS[review.doc_type] ?? "document";
  const invoiceNo = (review.record.invoice_no as { raw?: string } | undefined)?.raw;
  const open = review.review ? [] : review.blockers;
  const overriding = outcome === "approved" && open.length > 0;
  const meaning = review.meanings[outcome] ?? (outcome === "approved" ? `I approve this ${noun}` : `I reject this ${noun}`);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (overriding && !override.trim()) return setError("Say why you approve while checks are still open.");
    if (outcome === "rejected" && !note.trim()) return setError(`Say why you reject this ${noun}.`);
    if (outcome === "approved" && !note.trim()) return setError("Add a note for the record.");
    if (!callerEmail && !email.trim()) return setError("Enter the email you sign in with.");
    if (pin.length < 6) return setError("Enter your 6-digit PIN.");
    setBusy(true);
    setError(null);
    const signer = callerEmail ?? email.trim();
    try {
      // The reply is the signature itself; the page reloads the review to show it.
      await api(`/documents/${review.document_id}/review`, {
        method: "POST",
        json: {
          outcome,
          meaning,
          reason: note.trim(),
          override_reason: overriding ? override.trim() : null,
          expected_record_sha256: review.record_sha256,
          email: signer,
          pin,
        },
      });
      if (!callerEmail) rememberEmail(signer);
      onSigned();
    } catch (caught) {
      setPin("");
      if (caught instanceof ApiError && caught.status === 409) {
        const fresh = await api<Review>(`/documents/${review.document_id}/review`).catch(() => null);
        if (fresh && fresh.record_sha256 !== review.record_sha256) return setStale(fresh);
        setError(caught.detail);
      } else if (caught instanceof ApiError && (caught.status === 401 || caught.status === 403)) {
        setError("Those details are not right. Your PIN locks for 15 minutes after five wrong tries.");
      } else if (caught instanceof ApiError && caught.status === 429) {
        setError("Too many wrong PINs. Signing is locked for 15 minutes.");
      } else {
        setError(caught instanceof ApiError ? caught.detail : "The signature could not be recorded. Try again.");
      }
    } finally {
      setBusy(false);
    }
  };

  if (stale) {
    const changed = stale.corrections.at(-1);
    return (
      <Dialog
        key="stale"
        title="This record changed since you opened it"
        kicker="Electronic signature"
        role="alertdialog"
        onClose={onClose}
        actions={
          <>
            <button className="btn btn-secondary" onClick={onClose}>
              Close
            </button>
            <button className="btn btn-primary" onClick={() => onReload(stale)} data-autofocus>
              <RefreshCw size={14} strokeWidth={1.5} aria-hidden="true" /> Reload record
            </button>
          </>
        }
      >
        <p>
          {changed ? (
            <>
              {changed.reviewer_name} corrected <b>{fieldLabel(changed.path)}</b> at {localTime(changed.created_at)}.{" "}
            </>
          ) : (
            "Someone changed it. "
          )}
          Nothing was signed. Reload to see the current record, then sign again.
        </p>
        <dl className="details mono" style={{ fontSize: 12 }}>
          <dt>You saw</dt>
          <dd style={{ textDecoration: "line-through", overflowWrap: "anywhere" }}>{hashGroups(review.record_sha256)}</dd>
          <dt>Now</dt>
          <dd style={{ overflowWrap: "anywhere" }}>{hashGroups(stale.record_sha256)}</dd>
        </dl>
      </Dialog>
    );
  }

  const verb = outcome === "approved" ? "Approve" : "Reject";
  return (
    <Dialog title={`${verb} ${noun}${invoiceNo ? ` ${invoiceNo}` : ""}`} kicker="Electronic signature" onClose={onClose} width={520}>
      <form onSubmit={submit} noValidate style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Seg
          name="sign-outcome"
          label="Outcome"
          value={outcome}
          onChange={(next) => {
            setOutcome(next);
            setError(null);
          }}
          options={[
            { value: "approved", label: "Approve" },
            { value: "rejected", label: "Reject" },
          ]}
        />
        <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="label">What your signature means</legend>
          <label className="check" style={{ marginTop: 6 }}>
            <input type="radio" name="meaning" checked readOnly /> {meaning}
          </label>
        </fieldset>

        {overriding && (
          <div className="reason-box reason-warn" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <p className="reason reason-warn">
              <AlertTriangle strokeWidth={1.5} aria-hidden="true" />
              <b>Checks are still open:</b>
            </p>
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13 }}>
              {open.map((blocker) => (
                <li key={blocker}>{blockerKind(blocker).text}</li>
              ))}
            </ul>
            <div className="field">
              <label htmlFor="sign-override">Why approve anyway? (required)</label>
              <textarea id="sign-override" className="input" value={override} onChange={(e) => setOverride(e.target.value)} />
            </div>
          </div>
        )}

        <div className="field">
          <label htmlFor="sign-note">{outcome === "rejected" ? `Reason for rejecting (required)` : "Note for the record (required)"}</label>
          <textarea
            id="sign-note"
            className="input"
            style={{ minHeight: 60 }}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={outcome === "approved" ? "For example: checked against the delivery challan" : undefined}
          />
        </div>

        {!callerEmail && (
          <div className="field">
            <label htmlFor="sign-email">Your email</label>
            <input id="sign-email" className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
        )}

        <div className="field">
          <PinInput
            value={pin}
            onChange={setPin}
            autoFocus
            label={`Signing as ${callerName || "you"}${callerEmail ? ` (${callerEmail})` : ""}. Enter your 6-digit PIN.`}
          />
          <span className="muted" style={{ fontSize: 12 }}>
            Signing as {callerName || "you"}
            {callerEmail ? ` (${callerEmail})` : ""}. Enter your PIN.
          </span>
        </div>

        <div className="hash-box">
          <p style={{ fontSize: 12.5 }}>You are signing the record with this fingerprint. If it changes before you sign, the signature is refused.</p>
          <p className="mono" style={{ fontSize: 12, overflowWrap: "anywhere" }}>
            {hashGroups(review.record_sha256)}
          </p>
        </div>

        {error && (
          <p role="alert" className="reason-box reason-fail" style={{ fontSize: 13 }}>
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={`btn btn-primary${outcome === "rejected" ? " btn-danger" : ""}`} disabled={busy}>
            {busy ? "Signing…" : outcome === "approved" ? "Sign and approve" : "Sign and reject"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
