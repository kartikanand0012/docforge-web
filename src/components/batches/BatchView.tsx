"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Alert, StatusBadge, Time } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { getBatch, itemWords, retryFailed, type Batch } from "@/lib/batches";
import { bytes } from "@/lib/format";
import { splitPath } from "@/lib/split";

const REFRESH_MS = 3000;

/** A batch's files, counted live: total, processed, ready, failed, with each file's state and a
 * retry for the files whose reading failed. It refreshes itself while files are being read;
 * leaving this page stops nothing. */
export function BatchView({ id, mayRetry }: { id: string; mayRetry: boolean }) {
  const [batch, setBatch] = useState<Batch | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  const load = useCallback(() => {
    getBatch(id).then(
      (found) => {
        setBatch(found);
        setError(null);
      },
      (caught: unknown) => setError(caught instanceof ApiError ? caught.detail : "The batch could not be loaded."),
    );
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const waiting = batch?.counts.waiting ?? 0;
  useEffect(() => {
    if (!batch || waiting === 0) return;
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [batch, waiting, load]);

  if (error && !batch) return <Alert kind="fail" title="Not loaded">{error}</Alert>;
  if (!batch) return <p className="muted" aria-busy="true">Loading…</p>;

  const counts = batch.counts;
  const readingFailed = batch.items.filter((item) => item.state === "failed").length;
  const tiles: { label: string; value: number; note?: string }[] = [
    { label: "Files", value: counts.total },
    { label: "Processed", value: counts.processed, note: counts.waiting ? `${counts.waiting} still reading` : "all done" },
    { label: "Ready", value: counts.ready },
    { label: "Failed", value: counts.failed },
    { label: "Already here", value: counts.already_received },
    { label: "Split into invoices", value: counts.split },
  ];

  const retry = async () => {
    setRetrying(true);
    try {
      setBatch(await retryFailed(batch.id));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.detail : "The retry could not be started.");
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <p className="muted">
        {batch.kind === "zip" ? `ZIP ${batch.name ?? ""}` : "Files dropped together"} · by {batch.person} · <Time iso={batch.created_at} />
      </p>
      <div className="stats-strip" role="group" aria-label="Batch counts" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 }}>
        {tiles.map((tile) => (
          <div key={tile.label} className="panel" style={{ padding: 12 }}>
            <p className="muted" style={{ fontSize: 12.5 }}>{tile.label}</p>
            <p style={{ fontSize: 22, fontWeight: 600 }}>{tile.value}</p>
            {tile.note && <p className="muted" style={{ fontSize: 12 }}>{tile.note}</p>}
          </div>
        ))}
      </div>
      <p className="muted" role="status" aria-live="polite" style={{ fontSize: 13 }}>
        {counts.total} files: {counts.received} new, {counts.already_received} already here, {counts.refused} refused.
        {counts.not_sent > 0 && ` ${counts.not_sent} more were never sent from the browser; upload those again.`}
        {counts.waiting > 0 && " Reading carries on if you leave this page."}
      </p>
      {error && <Alert kind="warn" title="Not refreshed">{error}</Alert>}
      {mayRetry && readingFailed > 0 && (
        <div>
          <button className="btn btn-primary" onClick={() => void retry()} disabled={retrying}>
            {retrying ? "Starting…" : `Read the ${readingFailed} failed file${readingFailed === 1 ? "" : "s"} again`}
          </button>
        </div>
      )}
      <ul className="upload-list" aria-label="Files in this batch">
        {batch.items.map((item) => {
          const words = itemWords(item);
          return (
            <li key={item.id} className="upload-row">
              <div style={{ minWidth: 0 }}>
                <p style={{ fontWeight: 500, overflowWrap: "anywhere" }}>{item.filename}</p>
                <p className="muted" style={{ fontSize: 12 }}>{bytes(item.size_bytes)}</p>
                {words.text && <p style={{ fontSize: 13, color: words.kind === "fail" ? "var(--st-fail-fg)" : undefined }}>{words.text}</p>}
              </div>
              <div className="upload-actions">
                <StatusBadge kind={words.kind}>{words.word}</StatusBadge>
                {item.state === "split_review" && item.document_id && (
                  <Link className="btn btn-secondary" href={splitPath(item.document_id)}>
                    Group pages
                  </Link>
                )}
                {item.document_id && item.state !== "deleted" && item.state !== "split_review" && (
                  <Link className="btn btn-secondary" href={`/documents/${item.document_id}`}>
                    Open
                  </Link>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
