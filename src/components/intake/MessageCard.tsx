"use client";

import Link from "next/link";
import { useState } from "react";
import { ConfirmDialog } from "@/components/Dialog";
import { Alert, StatusBadge, Time } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { bytes } from "@/lib/format";
import {
  acceptMessage, discardMessage, documentWords, isHeld, itemKind, itemWords, mayRetry, retryItem, statusKind, statusWords,
  type IntakeItem, type IntakeMessage,
} from "@/lib/intake";  // prettier-ignore

const failed = (caught: unknown, fallback: string) => (caught instanceof ApiError ? caught.detail : fallback);

type Props = {
  message: IntakeMessage;
  /** Accept, Discard and Retry are offered (whoever reviews bills). */
  mayDecide: boolean;
  onChanged?: (message: IntakeMessage) => void;
  onRetried?: (item: IntakeItem) => void;
};

/** One mail received: who sent it, when, what became of it and of each attachment. */
export function MessageCard({ message, mayDecide, onChanged, onRetried }: Props) {
  const [busy, setBusy] = useState<string | null>(null); // "accept", "discard" or the id of an attachment being read again
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [retried, setRetried] = useState<Set<string>>(() => new Set());

  const decide = async (action: "accept" | "discard") => {
    if (busy) return;
    setBusy(action);
    setError(null);
    try {
      const changed = await (action === "accept" ? acceptMessage(message.id) : discardMessage(message.id));
      setAsking(false);
      onChanged?.(changed);
    } catch (caught) {
      setAsking(false);
      setError(failed(caught, action === "accept" ? "The mail was not accepted. Try again." : "The mail was not discarded. Try again."));
    } finally {
      setBusy(null);
    }
  };

  const retry = async (item: IntakeItem) => {
    if (busy) return;
    setBusy(item.id);
    setError(null);
    try {
      await retryItem(item.id);
      setRetried((current) => new Set(current).add(item.id));
      onRetried?.(item);
    } catch (caught) {
      setError(failed(caught, "It was not read again. Try again."));
    } finally {
      setBusy(null);
    }
  };

  const held = isHeld(message);
  return (
    <li className="intake-message">
      <div className="intake-message-head">
        <div style={{ minWidth: 0 }}>
          <p className="intake-subject">{message.subject || "(no subject)"}</p>
          <p className="muted" style={{ fontSize: 13, overflowWrap: "anywhere" }}>
            From {message.sender} · <Time iso={message.received_at} />
          </p>
        </div>
        <StatusBadge kind={statusKind(message.status)}>{statusWords(message.status)}</StatusBadge>
      </div>
      {message.reason && <p style={{ fontSize: 13 }}>{message.reason}</p>}
      {message.decided_by && message.decided_at && (
        <p className="muted" style={{ fontSize: 12.5 }}>
          {statusWords(message.status)} by {message.decided_by} · <Time iso={message.decided_at} />
        </p>
      )}

      {message.items.length === 0 ? (
        <p className="muted" style={{ fontSize: 13 }}>
          No attachments, so there was nothing to read.
        </p>
      ) : (
        <ul className="intake-items" aria-label="Attachments">
          {message.items.map((item) => {
            const where = documentWords(item.document_status);
            return (
              <li key={item.id} className="intake-item">
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p style={{ overflowWrap: "anywhere" }}>
                    <b>{item.filename}</b> <span className="muted">({bytes(item.size_bytes)})</span>
                  </p>
                  <p style={{ fontSize: 13 }}>
                    <StatusBadge kind={itemKind(item)}>{itemWords(item)}</StatusBadge>
                    {where && <span className="muted"> · document {retried.has(item.id) ? "being read again" : where}</span>}
                  </p>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  {item.document_id && (
                    <Link className="btn btn-ghost" href={`/documents/${item.document_id}`}>
                      Open the document
                    </Link>
                  )}
                  {mayDecide && mayRetry(item) && !retried.has(item.id) && (
                    <button className="btn btn-secondary" onClick={() => void retry(item)} disabled={busy !== null}>
                      {busy === item.id ? "Retrying…" : "Retry"}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {mayDecide && held && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn btn-primary" onClick={() => void decide("accept")} disabled={busy !== null}>
            {busy === "accept" ? "Accepting…" : "Accept and read it"}
          </button>
          <button className="btn btn-secondary btn-danger" onClick={() => setAsking(true)} disabled={busy !== null}>
            Discard…
          </button>
        </div>
      )}
      {error && (
        <Alert kind="fail" title="Not done.">
          {error}
        </Alert>
      )}
      {asking && (
        <ConfirmDialog
          title="Discard this mail?"
          body={`The held copies of its attachments are deleted and nothing is read. The mail from ${message.sender} stays in the list as discarded.`}
          action="Discard"
          busy={busy === "discard"}
          onConfirm={() => void decide("discard")}
          onClose={() => setAsking(false)}
        />
      )}
    </li>
  );
}
