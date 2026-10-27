"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Dialog } from "@/components/Dialog";
import { Tag, Time } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import type { Review } from "@/lib/review";

/** GET /v1/documents/{id}/order-candidates: live purchase orders, newest first. */
export type OrderCandidate = { document_id: string; filename: string; po_no: string | null; supplier_name: string | null; created_at: string; same_supplier: boolean };

const orderName = (order: OrderCandidate) => (order.po_no ? `Order ${order.po_no}` : order.filename);

const OUTCOME: Record<string, string> = {
  match: " Every line agrees with the order.",
  mismatch: " It does not match the order; the differences are listed in Order match.",
};

/** Link an invoice to its purchase order by hand: the orders on file (the same supplier's first),
 * and why this one, for the audit trail. */
export function LinkOrderDialog({ review, onClose, onLinked }: { review: Review; onClose: () => void; onLinked: (review: Review, message: string) => void }) {
  const [orders, setOrders] = useState<OrderCandidate[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const errorBox = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    let live = true;
    api<OrderCandidate[]>(`/documents/${review.document_id}/order-candidates`).then(
      // The same supplier's orders first, each group newest first as the API sends them.
      (found) => live && setOrders([...found.filter((order) => order.same_supplier), ...found.filter((order) => !order.same_supplier)]),
      (caught: unknown) => live && setLoadError(caught instanceof ApiError ? caught.detail : "The orders on file could not be loaded."),
    );
    return () => {
      live = false;
    };
  }, [review.document_id]);

  useEffect(() => {
    if (error) errorBox.current?.scrollIntoView?.({ block: "nearest" });
  }, [error]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const order = orders?.find((candidate) => candidate.document_id === chosen);
    if (!order) return setError("Choose the purchase order this invoice is for.");
    if (!reason.trim()) return setError("Say why this is the right order.");
    setBusy(true);
    setError(null);
    try {
      const next = await api<Review>(`/documents/${review.document_id}/order-link`, {
        method: "POST",
        json: { order_document_id: order.document_id, reason: reason.trim() },
      });
      onLinked(next, `Linked to ${order.po_no ? `order ${order.po_no}` : order.filename}.${OUTCOME[next.match_status] ?? ""}`);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.detail : "The order was not linked. Try again.");
      setBusy(false);
    }
  };

  return (
    <Dialog
      title="Link this invoice to its purchase order"
      kicker={review.filename}
      onClose={onClose}
      width={560}
      actions={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="link-order-form" className="btn btn-primary" disabled={busy || !orders?.length}>
            {busy ? "Linking…" : "Link order"}
          </button>
        </>
      }
    >
      {orders === null && !loadError && (
        <p className="muted" aria-busy="true">
          Loading the orders on file…
        </p>
      )}
      {loadError && (
        <p role="alert" className="reason-box reason-fail" style={{ fontSize: 13 }}>
          {loadError}
        </p>
      )}
      {orders?.length === 0 && <p>No purchase orders on file yet. Upload the order first, then link it here.</p>}
      {orders && orders.length > 0 && (
        <form id="link-order-form" onSubmit={submit} noValidate style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <fieldset className="order-options">
            <legend className="label">Which purchase order</legend>
            {orders.map((order) => (
              <label key={order.document_id} className={`order-option${order.same_supplier ? " order-option-same" : ""}`}>
                <input type="radio" name="order" value={order.document_id} checked={chosen === order.document_id} onChange={() => setChosen(order.document_id)} />
                <span className="order-option-text">
                  <b>{orderName(order)}</b>
                  {order.same_supplier && <Tag>Same supplier</Tag>}
                  <span className="muted">
                    {[order.supplier_name ?? "Supplier not read", order.po_no ? order.filename : null].filter(Boolean).join(" · ")} · received{" "}
                    <Time iso={order.created_at} />
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
          <div className="field">
            <label htmlFor="link-reason">Why this order? (required)</label>
            <textarea id="link-reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="For example: the supplier confirmed the order number by phone" />
          </div>
          <p className="muted" style={{ fontSize: 12 }}>
            The invoice is compared with this order at once. Recorded in the audit trail with your reason.
          </p>
        </form>
      )}
      {error && (
        <p role="alert" ref={errorBox} className="reason-box reason-fail" style={{ fontSize: 13 }}>
          {error}
        </p>
      )}
    </Dialog>
  );
}
