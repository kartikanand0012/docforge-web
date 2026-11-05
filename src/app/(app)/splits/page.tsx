"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Alert, EmptyPanel, StatusBadge, Time } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { listSplits, splitPath, type Split } from "@/lib/split";
import { useTitle } from "@/lib/useTitle";
import { Layers } from "lucide-react";

/** Files holding several invoices: those waiting for a person to group their pages, then those
 * divided recently. */
export default function SplitsPage() {
  useTitle("Split review");
  const [waiting, setWaiting] = useState<Split[] | null>(null);
  const [done, setDone] = useState<Split[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    Promise.all([listSplits("review"), listSplits("split")]).then(
      ([review, split]) => {
        if (!live) return;
        setWaiting(review);
        setDone(split);
      },
      (caught: unknown) => live && setError(caught instanceof ApiError ? caught.detail : "The list could not be loaded."),
    );
    return () => {
      live = false;
    };
  }, []);

  return (
    <div className="screen">
      <header className="screen-header">
        <div>
          <h1>Split review</h1>
          <p className="sub">PDFs that hold several invoices. Where DocForge is not sure where one invoice ends, a person groups the pages first.</p>
        </div>
      </header>
      <div className="screen-body" style={{ maxWidth: 960, display: "flex", flexDirection: "column", gap: 16 }}>
        {error && <Alert kind="fail" title="Not loaded">{error}</Alert>}
        {waiting === null && !error && <p className="muted" aria-busy="true">Loading…</p>}
        {waiting && waiting.length === 0 && (
          <EmptyPanel icon={Layers} title="Nothing to group" text="No file is waiting for its pages to be grouped." />
        )}
        {waiting && waiting.length > 0 && (
          <ul className="upload-list" aria-label="Waiting to be grouped">
            {waiting.map((split) => (
              <li key={split.document_id} className="upload-row">
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontWeight: 500, overflowWrap: "anywhere" }}>{split.filename}</p>
                  <p className="muted" style={{ fontSize: 12.5 }}>
                    {split.page_count} pages · about {split.counts.invoices} invoices · <Time iso={split.created_at} />
                  </p>
                  {split.reason && <p style={{ fontSize: 13 }}>{split.reason}</p>}
                </div>
                <div className="upload-actions">
                  <StatusBadge kind="warn">Group pages</StatusBadge>
                  <Link className="btn btn-primary" href={splitPath(split.document_id)}>
                    Group pages
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
        {done.length > 0 && (
          <section aria-labelledby="done-title">
            <h2 id="done-title" style={{ fontSize: 17 }}>Divided</h2>
            <ul className="upload-list">
              {done.map((split) => (
                <li key={split.document_id} className="upload-row">
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontWeight: 500, overflowWrap: "anywhere" }}>{split.filename}</p>
                    <p className="muted" style={{ fontSize: 12.5 }}>
                      {split.counts.pages} pages = {split.counts.invoice_pages} in {split.counts.invoices} invoices + {split.counts.non_invoice_pages} not an
                      invoice · {split.automatic ? "divided by DocForge" : `grouped by ${split.decided_person ?? "a reviewer"}`}
                    </p>
                  </div>
                  <div className="upload-actions">
                    <Link className="btn btn-secondary" href={`/documents/${split.document_id}`}>
                      Open
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
