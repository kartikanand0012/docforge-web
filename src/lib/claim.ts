"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, api, apiUrl } from "@/lib/api";

/** Who is reviewing a document now. A claim is a lease, not a lock: it lasts a few minutes
 * and the open page renews it, so a closed tab or a crash frees the document by itself. The
 * API refuses a correction, a signature or a new reading from anyone but its holder. */
export type Claim = { reviewer_name: string; claimed_at: string; expires_at: string; mine: boolean };

export const RENEW_EVERY = 60_000;

/** Someone else holds it: this page reads, but does not change, the document. */
export function heldByOther(claim: Claim | null): boolean {
  return claim !== null && !claim.mine;
}

/** Claims the document while `active` (an unsigned version on screen), renews the claim while
 * the page is open, and lets it go when the page closes. When another reviewer holds it, the
 * renewals take it over as soon as theirs ends. An API without claims leaves `claim` null. */
export function useReviewClaim(documentId: string, active: boolean) {
  const [claim, setClaim] = useState<Claim | null>(null);
  const [takeOverError, setTakeOverError] = useState<string | null>(null);
  const [takingOver, setTakingOver] = useState(false);
  // The document on screen now, so a take-over that answers after a move to another is dropped.
  const current = useRef(documentId);
  const busy = useRef(false);

  useEffect(() => {
    current.current = documentId;
  }, [documentId]);

  useEffect(() => {
    if (!active) return;
    let stopped = false;
    // The ask on its way, if any: a release sent before it lands would be undone by it.
    let pending: Promise<unknown> = Promise.resolve();
    const ask = () => {
      pending = api<Claim>(`/documents/${documentId}/claim`, { method: "POST", json: { take_over: false } }).then(
        (found) => !stopped && setClaim(found),
        () => undefined, // the API enforces claims; a missed renewal only delays the banner
      );
    };
    ask();
    const timer = setInterval(ask, RENEW_EVERY);
    // Only the holder's own claim is released; anyone else's is left alone by the API.
    const release = () => void fetch(apiUrl(`/documents/${documentId}/claim`), { method: "DELETE", keepalive: true }).catch(() => undefined);
    // A page restored from the back-forward cache let its claim go on the way out: ask again.
    const restored = (event: PageTransitionEvent) => event.persisted && ask();
    window.addEventListener("pagehide", release);
    window.addEventListener("pageshow", restored);
    return () => {
      stopped = true;
      clearInterval(timer);
      window.removeEventListener("pagehide", release);
      window.removeEventListener("pageshow", restored);
      void pending.then(release);
      setClaim(null);
    };
  }, [documentId, active]);

  const takeOver = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setTakingOver(true);
    setTakeOverError(null);
    const asked = documentId;
    try {
      const taken = await api<Claim>(`/documents/${asked}/claim`, { method: "POST", json: { take_over: true } });
      if (current.current === asked) setClaim(taken);
    } catch (caught) {
      if (current.current === asked) setTakeOverError(caught instanceof ApiError ? caught.detail : "It was not taken over. Try again.");
    } finally {
      busy.current = false;
      setTakingOver(false);
    }
  }, [documentId]);

  return { claim, takeOver, takeOverError, takingOver };
}
