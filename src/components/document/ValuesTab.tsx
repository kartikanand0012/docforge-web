"use client";

import { AlertTriangle, Check, HelpCircle, Info, Pencil, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { PinInput } from "@/components/PinInput";
import { ReasonLine, Seg } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { fieldAt } from "@/lib/fields";
import { rememberEmail, savedEmail } from "@/lib/reviewer";
import { blockerKind, blockerTarget, groupOrder, type FieldView, type Review } from "@/lib/review";

const CHECK_ICONS = { Passed: Check, Uncertain: HelpCircle, Failed: X, Corrected: Info };

type Props = {
  review: Review;
  fields: FieldView[];
  filter: "all" | "flagged";
  onFilter: (filter: "all" | "flagged") => void;
  activePath: string | null;
  hoveredPath: string | null;
  onHover: (path: string | null) => void;
  onActivate: (path: string) => void;
  editingPath: string | null;
  onEdit: (path: string | null) => void;
  onCorrected: (review: Review, path: string) => void;
  onBlockerTab: (tab: "order" | "certificates") => void;
  callerEmail: string | null;
};

export function ValuesTab(props: Props) {
  const { review, fields, filter, activePath, hoveredPath, editingPath } = props;
  const shown = filter === "flagged" ? fields.filter((field) => field.flagged) : fields;
  const flagged = fields.filter((field) => field.flagged).length;
  const groups = [...new Set([...groupOrder(review.doc_type), ...shown.map((field) => field.group)])].filter((group) =>
    shown.some((field) => field.group === group),
  );

  return (
    <div className="values">
      {review.blockers.length > 0 && !review.review && (
        <div className="blockers" role="region" aria-label="What needs a person">
          <p className="blockers-title">
            <AlertTriangle size={16} strokeWidth={1.5} aria-hidden="true" />
            {review.blockers.length === 1 ? "1 thing needs" : `${review.blockers.length} things need`} a person before this can be approved
          </p>
          {review.blockers.map((blocker) => {
            const why = blockerKind(blocker);
            const target = blockerTarget(blocker, fields);
            return (
              <button
                key={blocker}
                className="blocker"
                onClick={() => {
                  if (target && "path" in target) props.onActivate(target.path);
                  else if (target) props.onBlockerTab(target.tab);
                }}
              >
                <ReasonLine kind={why.kind} label={why.label} text={why.text} />
              </button>
            );
          })}
        </div>
      )}

      <div className="values-filter">
        <Seg
          name="value-filter"
          label="Which values to show"
          value={filter}
          onChange={props.onFilter}
          options={[
            { value: "all", label: `All ${fields.length}` },
            { value: "flagged", label: `Needs a person ${flagged}` },
          ]}
        />
        <span className="muted" style={{ fontSize: 12 }}>
          <kbd>J</kbd> <kbd>K</kbd> value · <kbd>C</kbd> correct
        </span>
      </div>

      {!shown.length && <p className="muted" style={{ padding: "12px 16px" }}>Nothing here needs a person.</p>}

      {groups.map((group) => (
        <section key={group} aria-labelledby={`group-${group}`}>
          <h3 id={`group-${group}`} className="group-label values-group">
            {group}
          </h3>
          {group === "Lines" && filter === "all" && <LinesTable review={review} fields={fields} />}
          {shown
            .filter((field) => field.group === group)
            .map((field) => (
              <div key={field.path}>
                <FieldRow
                  field={field}
                  active={field.path === activePath}
                  hovered={field.path === hoveredPath}
                  onHover={props.onHover}
                  onActivate={props.onActivate}
                  onEdit={() => props.onEdit(field.path)}
                />
                {editingPath === field.path && (
                  <CorrectionForm
                    review={review}
                    field={field}
                    callerEmail={props.callerEmail}
                    onCancel={() => props.onEdit(null)}
                    onSaved={(next) => props.onCorrected(next, field.path)}
                  />
                )}
              </div>
            ))}
        </section>
      ))}
    </div>
  );
}

function FieldRow({
  field, active, hovered, onHover, onActivate, onEdit,
}: { field: FieldView; active: boolean; hovered: boolean; onHover: (p: string | null) => void; onActivate: (p: string) => void; onEdit: () => void }) {  // prettier-ignore
  const checksId = `checks-${field.path}`;
  return (
    <div
      className={`field-row${active ? " active" : ""}${hovered ? " hovered" : ""}`}
      data-path={field.path}
      onMouseEnter={() => onHover(field.path)}
      onMouseLeave={() => onHover(null)}
    >
      <div className="field-head">
        <span className="field-label">{field.label}</span>
        {field.status === "corrected" && <span className="badge badge-info">Corrected</span>}
      </div>
      <div className="field-value-line">
        <button
          className="field-value num"
          aria-label={`${field.label}: ${field.display}`}
          aria-describedby={checksId}
          onClick={() => onActivate(field.path)}
          onFocus={() => onActivate(field.path)}
        >
          {field.display}
        </button>
        {field.editable && (
          <button className="btn btn-secondary" onClick={onEdit} aria-label={`Correct ${field.label}`}>
            <Pencil size={13} strokeWidth={1.5} aria-hidden="true" /> Correct
          </button>
        )}
      </div>
      <div id={checksId} className="field-checks">
        {field.checks.map((check, index) => {
          const Icon = CHECK_ICONS[check.word];
          return (
            <p key={index} className={`reason reason-${check.kind === "ok" ? "ok" : check.kind}`}>
              <Icon strokeWidth={1.5} aria-hidden="true" />
              <span>
                <b>{check.word}:</b> {check.text}
              </span>
            </p>
          );
        })}
      </div>
    </div>
  );
}

function LinesTable({ review, fields }: { review: Review; fields: FieldView[] }) {
  const lines = (review.record.lines as unknown[] | undefined) ?? [];
  if (!lines.length) return null;
  const flagged = new Set(fields.filter((field) => field.flagged).map((field) => field.path));
  const cell = (index: number, name: string) => {
    const path = `lines[${index}].${name}`;
    const found = fieldAt(review.record, path);
    const text = found?.raw ?? (found?.value === null || found?.value === undefined ? "—" : String(found.value));
    return <span className={flagged.has(path) ? "flag-text" : undefined}>{text}</span>;
  };
  return (
    <div className="table-wrap lines-table">
      <table className="table num" style={{ fontSize: 13, minWidth: 460 }}>
        <thead>
          <tr>
            <th scope="col">Item</th>
            <th scope="col">Batch</th>
            <th scope="col" className="right">Qty</th>
            <th scope="col" className="right">Rate</th>
            <th scope="col" className="right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((_, index) => (
            <tr key={index}>
              <td>{cell(index, "product_name")}</td>
              <td>{cell(index, "batch_no")}</td>
              <td className="right">{cell(index, "qty")}</td>
              <td className="right">{review.doc_type === "purchase_order" ? cell(index, "rate") : cell(index, "ptr")}</td>
              <td className="right">{cell(index, "amount")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CorrectionForm({
  review, field, callerEmail, onCancel, onSaved,
}: { review: Review; field: FieldView; callerEmail: string | null; onCancel: () => void; onSaved: (review: Review) => void }) {  // prettier-ignore
  const [text, setText] = useState(field.display === "—" ? "" : field.display);
  const [reason, setReason] = useState("");
  const [pin, setPin] = useState("");
  const [email, setEmail] = useState(() => callerEmail ?? savedEmail());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => first.current?.focus(), []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!text.trim()) return setError("Enter the value as it should read.");
    if (!reason.trim()) return setError("Say why the reading is wrong.");
    if (!callerEmail && !email.trim()) return setError("Enter the email you sign in with.");
    if (pin.length < 6) return setError("Enter your 6-digit PIN.");
    setBusy(true);
    setError(null);
    try {
      const signer = callerEmail ?? email.trim();
      const next = await api<Review>(`/documents/${review.document_id}/corrections`, {
        method: "POST",
        // The record as shown: a change made by someone else meanwhile is refused, not overwritten.
        json: { path: field.path, text: text.trim(), reason: reason.trim(), email: signer, pin, expected_record_sha256: review.record_sha256 },
      });
      if (!callerEmail) rememberEmail(signer);
      onSaved(next);
    } catch (caught) {
      setPin("");
      if (caught instanceof ApiError && (caught.status === 401 || caught.status === 403)) {
        setError("Those details are not right. Check your email and PIN.");
      } else if (caught instanceof ApiError && caught.status === 429) {
        setError("Too many wrong PINs. Correcting is locked for 15 minutes.");
      } else {
        setError(caught instanceof ApiError ? caught.detail : "The correction could not be saved. Try again.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="correction" onSubmit={submit} noValidate aria-label={`Correct ${field.label}`}>
      <div className="field">
        <label htmlFor="correction-value">New value (read as {field.display})</label>
        <input id="correction-value" ref={first} className="input num" value={text} onChange={(e) => setText(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="correction-reason">Reason</label>
        <input id="correction-reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What on the page shows it" />
      </div>
      {!callerEmail && (
        <div className="field">
          <label htmlFor="correction-email">Your email</label>
          <input id="correction-email" className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
      )}
      <div className="field">
        <span className="label">Your PIN</span>
        <PinInput value={pin} onChange={setPin} label="Your PIN, to record the correction as yours" />
      </div>
      {error && (
        <p role="alert" className="reason-box reason-fail" style={{ fontSize: 13 }}>
          {error}
        </p>
      )}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Saving…" : "Save correction"}
        </button>
      </div>
      <p className="muted" style={{ fontSize: 12 }}>
        Recorded in the audit trail as your correction. The record&apos;s hash changes, so sign after correcting.
      </p>
    </form>
  );
}
