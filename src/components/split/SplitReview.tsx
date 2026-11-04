"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Alert, StatusBadge } from "@/components/ui";
import { ApiError } from "@/lib/api";
import {
  confirmSplit, counts, fromProposal, getSplit, groupOf, pagesWord, startHere, thumbnailUrl, toggleNotInvoice, toNext, toPrevious,
  type Grouping, type Split,
} from "@/lib/split";  // prettier-ignore

/** One file's pages, grouped as proposed: a person moves a page to the previous or next invoice,
 * starts a new invoice at a page, or marks it "not an invoice page", then confirms. The counts
 * always add up; nothing is made until Confirm. */
export function SplitReview({ documentId, mayGroup }: { documentId: string; mayGroup: boolean }) {
  const router = useRouter();
  const [split, setSplit] = useState<Split | null>(null);
  const [grouping, setGrouping] = useState<Grouping | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let live = true;
    getSplit(documentId).then(
      (found) => {
        if (!live) return;
        setSplit(found);
        setGrouping(fromProposal(found));
      },
      (caught: unknown) => live && setError(caught instanceof ApiError ? caught.detail : "This file could not be loaded."),
    );
    return () => {
      live = false;
    };
  }, [documentId]);

  if (error && !split) return <Alert kind="fail" title="Not loaded">{error}</Alert>;
  if (!split || !grouping) return <p className="muted" aria-busy="true">Loading…</p>;

  if (split.status === "split") {
    return (
      <Alert kind="ok" title={`Split into ${split.counts.invoices} invoices`}>
        {split.decided_person ? `Grouped by ${split.decided_person}. ` : "Every page was clear, so DocForge divided it. "}
        <Link href={`/documents/${documentId}`}>Open the file and its invoices</Link>
      </Alert>
    );
  }

  const tally = counts(grouping, split.page_count);
  const doubt = new Set(split.pages_in_doubt);
  const change = (next: Grouping) => setGrouping(next);

  const confirm = async () => {
    setSending(true);
    setError(null);
    try {
      await confirmSplit(documentId, grouping);
      router.push(`/documents/${documentId}`);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.detail : "The grouping could not be saved.");
      setSending(false);
    }
  };

  const page = (number: number) => {
    const at = groupOf(grouping, number);
    const outside = grouping.nonInvoice.includes(number);
    return (
      <li key={number} className="panel" style={{ padding: 8, display: "flex", flexDirection: "column", gap: 6, width: 168 }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- the API's own PNG, through the proxy */}
        <img src={thumbnailUrl(documentId, number)} alt={`Page ${number}`} width={150} style={{ border: "1px solid var(--border)", background: "white" }} />
        <p style={{ fontSize: 13 }}>
          Page {number} {doubt.has(number) && <StatusBadge kind="warn">Unsure</StatusBadge>}
        </p>
        {mayGroup && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {!outside && (
              <button className="btn btn-ghost" style={{ fontSize: 12 }} disabled={at <= 0} onClick={() => change(toPrevious(grouping, number))}>
                ← Previous invoice
              </button>
            )}
            {!outside && (
              <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => change(toNext(grouping, number))}>
                {at === grouping.groups.length - 1 ? "New invoice →" : "Next invoice →"}
              </button>
            )}
            {!outside && grouping.groups[at]?.[0] !== number && (
              <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => change(startHere(grouping, number))}>
                Start an invoice here
              </button>
            )}
            <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => change(toggleNotInvoice(grouping, number))}>
              {outside ? "It is an invoice page" : "Not an invoice page"}
            </button>
          </div>
        )}
      </li>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {split.reason && (
        <Alert kind="warn" title="DocForge was not sure where the invoices divide">
          {split.reason}. Check the pages marked Unsure, move any page that is in the wrong place, then confirm.
        </Alert>
      )}
      <p role="status" aria-live="polite" aria-label="Pages placed" style={{ fontWeight: 500 }}>
        {tally.pages} pages = {tally.invoice_pages} in {tally.invoices} invoice{tally.invoices === 1 ? "" : "s"} + {tally.non_invoice_pages} not an
        invoice page{tally.non_invoice_pages === 1 ? "" : "s"} {tally.reconciles ? "✓" : "— every page must be placed once"}
      </p>
      {grouping.groups.map((pages, index) => {
        const proposed = split.proposed.find((group) => group.pages[0] === pages[0]);
        return (
          <section key={pages[0]} aria-label={`Invoice ${index + 1}`} className="panel" style={{ padding: 12 }}>
            <h2 style={{ fontSize: 16 }}>
              Invoice {index + 1} · {pagesWord(pages)}
              {proposed?.invoice_no && <span className="muted"> · No. {proposed.invoice_no}</span>}
              {proposed?.seller_gstin && <span className="muted"> · GSTIN {proposed.seller_gstin}</span>}
            </h2>
            <ul style={{ display: "flex", flexWrap: "wrap", gap: 8, listStyle: "none", padding: 0, marginTop: 8 }}>{pages.map(page)}</ul>
          </section>
        );
      })}
      <section aria-label="Not an invoice page" className="panel" style={{ padding: 12 }}>
        <h2 style={{ fontSize: 16 }}>Not an invoice page</h2>
        <p className="muted" style={{ fontSize: 12.5 }}>Covering letters, blank pages, statements. Kept with the original file; not read.</p>
        {grouping.nonInvoice.length === 0 ? (
          <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>None.</p>
        ) : (
          <ul style={{ display: "flex", flexWrap: "wrap", gap: 8, listStyle: "none", padding: 0, marginTop: 8 }}>{grouping.nonInvoice.map(page)}</ul>
        )}
      </section>
      {error && <Alert kind="fail" title="Not confirmed">{error}</Alert>}
      {mayGroup ? (
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-primary" disabled={sending || !tally.reconciles || tally.invoices === 0} onClick={() => void confirm()}>
            {sending ? "Making the invoices…" : `Confirm ${tally.invoices} invoice${tally.invoices === 1 ? "" : "s"}`}
          </button>
          <button className="btn btn-secondary" disabled={sending} onClick={() => setGrouping(fromProposal(split))}>
            Back to the proposal
          </button>
        </div>
      ) : (
        <p className="muted">Someone who reviews bills confirms how the pages group.</p>
      )}
    </div>
  );
}
