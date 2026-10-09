"use client";

import { ChevronLeft, RefreshCw, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChatThread, type Turn } from "@/components/chat/ChatThread";
import { AuditTab, CertificatesTab, OrderTab, TimelineTab, type AuditEntry, type TimelineStep } from "@/components/document/DocumentTabs";
import { PageViewer, type Highlight } from "@/components/document/PageViewer";
import { SignDialog } from "@/components/document/SignDialog";
import { ValuesTab } from "@/components/document/ValuesTab";
import { useCaller } from "@/components/Shell";
import { useToast } from "@/components/Toast";
import { Alert, DocTypeTag, Marks, StageProgress, StatusBadge, Time } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { hashGroups, hashShort } from "@/lib/format";
import { isId } from "@/lib/ids";
import { buildFields, type Review } from "@/lib/review";
import { stream } from "@/lib/sse";
import { isFinished, stageKind, stageWord } from "@/lib/stages";

type DocumentOut = {
  id: string; doc_type: string; filename: string; status: string; stage: string; page_count: number | null;
  ready_for_chat: boolean; created_at: string; media_type: string;
};  // prettier-ignore
type Detail = { document: DocumentOut; versions: { version_no: number; status: string; error: string | null }[] };
type QueueItem = { document_id: string; filename: string };
type Tab = "values" | "order" | "certificates" | "timeline" | "audit" | "ask";

// Where a key is text being typed: shortcuts stay out of the way. Checkboxes and radios are
// not text, so J/K/C/S still work after one is used.
const TEXT_INPUTS = new Set(["text", "email", "password", "search", "number", "tel", "url", "date"]);
const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT" ||
    (target instanceof HTMLInputElement && TEXT_INPUTS.has(target.type)));

export default function DocumentPage() {
  const { id } = useParams<{ id: string }>();
  if (!isId(id)) {
    return (
      <div className="screen">
        <div className="screen-body">
          <Alert kind="fail" title="No such document." action={<Link className="btn btn-secondary" href="/">Back to the review queue</Link>} />
        </div>
      </div>
    );
  }
  // Keyed by the document: opening the next one starts clean, never with this one's values,
  // page, zoom or Ask conversation.
  return (
    <Suspense fallback={<div className="screen" aria-busy="true" />}>
      <DocumentView key={id} />
    </Suspense>
  );
}

function DocumentView() {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const caller = useCaller();

  const [detail, setDetail] = useState<Detail | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [steps, setSteps] = useState<TimelineStep[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [failure, setFailure] = useState<string | null>(null);

  const [tab, setTab] = useState<Tab>("values");
  const [page, setPage] = useState(() => Math.max(1, Number(search.get("page")) || 1));
  const [zoom, setZoom] = useState(100);
  const [showAll, setShowAll] = useState(true);
  const [filter, setFilter] = useState<"all" | "flagged">("all");
  const [activePath, setActivePath] = useState<string | null>(null);
  const [hoveredPath, setHoveredPath] = useState<string | null>(null);
  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [signing, setSigning] = useState<"approved" | "rejected" | null>(null);
  const [highlight, setHighlight] = useState<Highlight | null>(null);
  const [askTurns, setAskTurns] = useState<Turn[]>([]);
  const [askConversation, setAskConversation] = useState<string | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const loads = useRef(0);

  const loadReview = useCallback(
    (docType: string) =>
      docType === "general"
        ? Promise.resolve(null)
        : api<Review>(`/documents/${id}/review`).catch((error: unknown) => {
            if (error instanceof ApiError && (error.status === 404 || error.status === 409)) return null;
            throw error;
          }),
    [id],
  );

  // Everything the view shows, loaded together; only the newest load is applied.
  const load = useCallback(() => {
    const ticket = ++loads.current;
    return api<Detail>(`/documents/${id}`)
      .then(async (found) => {
        const [nextReview, timeline, trail, waiting] = await Promise.all([
          loadReview(found.document.doc_type),
          api<TimelineStep[]>(`/documents/${id}/timeline`).catch(() => []),
          api<AuditEntry[]>(`/documents/${id}/audit`).catch(() => []),
          api<QueueItem[]>("/review/queue").catch(() => []),
        ]);
        if (ticket !== loads.current) return;
        setDetail(found);
        setReview(nextReview);
        setSteps(timeline);
        setAudit(trail);
        setQueue(waiting);
        setFailure(null);
      })
      .catch((error: unknown) => {
        if (ticket !== loads.current) return;
        setFailure(error instanceof ApiError ? error.detail : "The document could not be loaded.");
      });
  }, [id, loadReview]);

  useEffect(() => {
    void load();
  }, [load]);

  // A quote opened from chat or search: its boxes and words, handed over for this document.
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(`docforge.highlight.${id}`);
      if (!stored) return;
      sessionStorage.removeItem(`docforge.highlight.${id}`);
      const parsed = JSON.parse(stored) as Highlight & { page?: number };
      queueMicrotask(() => {
        setHighlight(parsed);
        if (parsed.page) setPage(parsed.page);
      });
    } catch {
      /* nothing handed over */
    }
  }, [id]);

  // While the document is still being read, its stages arrive live; at the end it reloads. One
  // stream for the whole reading (not one per stage): the API replays every stage on connect,
  // so steps already shown are skipped. If the stream ends early, polling takes over.
  const stage = detail?.document.stage;
  const reading = Boolean(stage) && !isFinished(stage ?? "");
  useEffect(() => {
    if (!reading) return;
    const controller = new AbortController();
    let done = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const take = (step: TimelineStep) => {
      setSteps((current) => (current.some((s) => s.stage === step.stage && s.at === step.at) ? current : [...current, step]));
      setDetail((current) => (current ? { ...current, document: { ...current.document, stage: step.stage } } : current));
      if (isFinished(step.stage)) {
        done = true;
        void load();
      }
    };
    const poll = async () => {
      try {
        const found = await api<Detail>(`/documents/${id}`);
        if (isFinished(found.document.stage)) {
          done = true;
          void load();
          return;
        }
      } catch {
        /* try again */
      }
      if (!controller.signal.aborted) timer = setTimeout(poll, 4000);
    };
    (async () => {
      try {
        for await (const event of stream(`/documents/${id}/events`, { signal: controller.signal })) {
          if (event.name === "stage") take(event.data as TimelineStep);
        }
      } catch {
        /* refused or cut: polling below */
      }
      if (!done && !controller.signal.aborted) timer = setTimeout(poll, 4000);
    })();
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [id, reading, load]);

  const fields = useMemo(() => (review ? buildFields(review) : []), [review]);
  const visible = useMemo(() => (filter === "flagged" ? fields.filter((field) => field.flagged) : fields), [fields, filter]);

  const activate = useCallback((path: string) => {
    setActivePath(path);
    setTab("values");
    requestAnimationFrame(() => {
      const row = panel.current?.querySelector<HTMLElement>(`[data-path="${CSS.escape(path)}"]`);
      if (row && panel.current) panel.current.scrollTop = row.offsetTop - 120;
    });
  }, []);

  const reprocess = async () => {
    try {
      await api(`/documents/${id}/reprocess`, { method: "POST" });
      toast(`Reading again. Version ${(review?.version_no ?? 1) + 1} appears here when it is ready; you can keep working on version ${review?.version_no ?? 1}.`);
      void load();
    } catch (error) {
      toast(error instanceof ApiError && error.status === 409 ? "A reading is already under way." : "It could not be read again just now.");
    }
  };

  // J/K move the active value, C corrects it, S signs, Esc steps back out.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "Escape") {
        // Esc steps back out: first the correction form; back to the queue only when nothing
        // else has focus, never from a field being typed in.
        if (editingPath) setEditingPath(null);
        else if (!signing && document.activeElement === document.body) router.push("/");
        return;
      }
      if (typing(event.target) || signing || !review) return;
      const index = visible.findIndex((field) => field.path === activePath);
      if (event.key === "j" || event.key === "k") {
        const next = visible[Math.min(Math.max(index + (event.key === "j" ? 1 : -1), 0), visible.length - 1)];
        if (next) activate(next.path);
      } else if (event.key === "c" && activePath && fields.find((field) => field.path === activePath)?.editable) {
        setEditingPath(activePath);
      } else if (event.key === "s" && !review.review) {
        setSigning("approved");
      } else return;
      event.preventDefault();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [visible, activePath, editingPath, signing, review, fields, activate, router]);

  if (failure) {
    return (
      <div className="screen">
        <div className="screen-body">
          <Alert kind="fail" title="This document could not be loaded." action={<Link className="btn btn-secondary" href="/">Back to the review queue</Link>}>
            {failure}
          </Alert>
        </div>
      </div>
    );
  }
  if (!detail) return <div className="screen" aria-busy="true" aria-label="Loading the document" />;

  const doc = detail.document;
  const general = doc.doc_type === "general";
  const position = queue.findIndex((item) => item.document_id === id);
  const next = queue.find((item, index) => item.document_id !== id && index >= Math.max(position, 0));
  const pages = review?.pages?.length ? review.pages : Array.from({ length: doc.page_count ?? 1 }, (_, i) => ({ number: i + 1, width: 595.28, height: 841.89 }));
  const flagged = fields.filter((field) => field.flagged).length;
  const party = review ? ((review.record.seller as { name?: { raw?: string } } | undefined)?.name?.raw ?? "") : "";
  const number = (review?.record.invoice_no as { raw?: string } | undefined)?.raw;
  const tabs: { id: Tab; label: string; count?: number; kind?: string }[] = general || !review
    ? [{ id: "timeline", label: "Timeline" }, { id: "audit", label: "Audit trail" }, { id: "ask", label: "Ask" }]
    : [
        { id: "values", label: "Values", count: flagged, kind: flagged ? "warn" : "ok" },
        ...(review.doc_type === "invoice"
          ? [
              { id: "order" as Tab, label: "Order match", count: review.discrepancies.filter((d) => d.severity === "error").length || undefined, kind: review.match_status === "mismatch" ? "fail" : "ok" },
              { id: "certificates" as Tab, label: "Certificates", count: review.certificates.length || undefined, kind: "info" },
            ]
          : []),
        { id: "timeline", label: "Timeline" },
        { id: "audit", label: "Audit trail" },
        { id: "ask", label: "Ask" },
      ];
  const currentTab = tabs.some((candidate) => candidate.id === tab) ? tab : tabs[0].id;

  return (
    <div className="screen document-screen">
      <header className="doc-header">
        <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
          <Link className="btn btn-ghost" href="/" style={{ alignSelf: "flex-start", paddingInline: 4 }}>
            <ChevronLeft size={14} strokeWidth={1.5} aria-hidden="true" /> Queue
          </Link>
          <p className="doc-meta">
            <DocTypeTag docType={doc.doc_type} />
            {isFinished(doc.stage) ? (
              <StatusBadge kind={stageKind(doc.stage)}>{stageWord(doc.stage)}</StatusBadge>
            ) : (
              <StageProgress stage={doc.stage} />
            )}
            <span className="muted">
              Version {review?.version_no ?? detail.versions.at(-1)?.version_no ?? 1} · {doc.page_count ?? "?"} page
              {doc.page_count === 1 ? "" : "s"} · <Time iso={doc.created_at} />
            </span>
          </p>
          <h1 className="doc-title">
            {doc.filename}
            {(party || number) && (
              <span className="muted doc-subtitle">
                {" "}
                {[party, number].filter(Boolean).join(" · ")}
              </span>
            )}
          </h1>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {position >= 0 && (
            <span className="muted num">
              {position + 1} of {queue.length} in queue
            </span>
          )}
          <button className="btn btn-secondary" onClick={() => void reprocess()}>
            <RefreshCw size={14} strokeWidth={1.5} aria-hidden="true" /> Read again
          </button>
        </div>
      </header>

      {review?.superseded && (
        <div className="offline-strip" role="status">
          <p>
            <b>A newer reading exists.</b> This is an earlier version; reload to see the latest.
          </p>
        </div>
      )}

      <div className="doc-body">
        <PageViewer
          documentId={id}
          pages={pages}
          page={page}
          onPage={setPage}
          fields={fields}
          hoveredPath={hoveredPath}
          activePath={activePath}
          onHover={setHoveredPath}
          onActivate={activate}
          showAll={showAll}
          onShowAll={setShowAll}
          zoom={zoom}
          onZoom={setZoom}
          highlight={highlight}
          onClearHighlight={() => setHighlight(null)}
        />

        <section className="doc-panel" aria-label="Values and history">
          <div className="tabs" role="tablist" aria-label="Document">
            {tabs.map((candidate) => (
              <button
                key={candidate.id}
                role="tab"
                id={`tab-${candidate.id}`}
                aria-selected={currentTab === candidate.id}
                aria-controls="doc-tabpanel"
                tabIndex={currentTab === candidate.id ? 0 : -1}
                className="tab"
                onClick={() => setTab(candidate.id)}
                onKeyDown={(event) => {
                  if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
                  const at = tabs.findIndex((item) => item.id === candidate.id);
                  const to = tabs[(at + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
                  setTab(to.id);
                  window.document.getElementById(`tab-${to.id}`)?.focus();
                }}
              >
                {candidate.label}
                {candidate.count ? <span className={`badge badge-${candidate.kind ?? "neutral"} tab-count`}>{candidate.count}</span> : null}
              </button>
            ))}
          </div>

          <div ref={panel} id="doc-tabpanel" role="tabpanel" aria-labelledby={`tab-${currentTab}`} className="doc-tabpanel">
            {!review && !general && !isFinished(doc.stage) && <p className="muted tab-body">The values appear here once the document has been read.</p>}
            {!review && !general && doc.stage === "failed" && (
              <div className="tab-body">
                <Alert kind="fail" title="This document could not be read.">
                  {steps.at(-1)?.detail ?? detail.versions.at(-1)?.error ?? "Try reading it again, or upload a clearer copy."}
                </Alert>
              </div>
            )}
            {currentTab === "values" && review && (
              <ValuesTab
                review={review}
                fields={fields}
                filter={filter}
                onFilter={setFilter}
                activePath={activePath}
                hoveredPath={hoveredPath}
                onHover={setHoveredPath}
                onActivate={activate}
                editingPath={editingPath}
                onEdit={setEditingPath}
                callerEmail={caller.email}
                onBlockerTab={(target) => setTab(target)}
                onCorrected={(nextReview, path) => {
                  setReview(nextReview);
                  setEditingPath(null);
                  setActivePath(path);
                  toast("Correction saved. The record changed, so it has a new fingerprint.");
                  void api<AuditEntry[]>(`/documents/${id}/audit`).then(setAudit).catch(() => undefined);
                }}
              />
            )}
            {currentTab === "order" && review && <OrderTab review={review} />}
            {currentTab === "certificates" && review && <CertificatesTab review={review} />}
            {currentTab === "timeline" && <TimelineTab steps={steps} live={!isFinished(doc.stage)} />}
            {currentTab === "audit" && <AuditTab entries={audit} />}
            {(currentTab === "ask" || askTurns.length > 0) && (
              <div hidden={currentTab !== "ask"}>
                <p className="muted" style={{ padding: "12px 16px 0", fontSize: 13 }}>
                  Questions here are answered from this document only.
                  {askConversation && (
                    <>
                      {" "}
                      <Link href={`/chat?c=${askConversation}`}>Open in Chat</Link>
                    </>
                  )}
                </p>
                <ChatThread
                  compact
                  turns={askTurns}
                  onTurns={setAskTurns}
                  conversationId={askConversation}
                  onConversation={setAskConversation}
                  scope={{ documentId: id }}
                  onQuote={(citation, n) => {
                    setHighlight({ boxes: citation.boxes, label: `Quote ${n}`, quote: citation.quote, source: `quote ${n} from chat` });
                    setPage(citation.page);
                  }}
                />
              </div>
            )}
          </div>

          {review && <SignBar review={review} onSign={setSigning} />}
        </section>
      </div>

      {signing && review && (
        <SignDialog
          review={review}
          initial={signing}
          callerName={caller.name}
          callerEmail={caller.email}
          onClose={() => setSigning(null)}
          onReload={(fresh) => {
            setReview(fresh);
            setSigning(null);
          }}
          onSigned={() => {
            setSigning(null);
            setEditingPath(null);
            void load();
            if (next) toast(`Signed and recorded. Next in the queue: ${next.filename}`, { label: "Open next", onClick: () => router.push(`/documents/${next.document_id}`) });
            else toast("Signed and recorded. Nothing else waits in the queue.");
          }}
        />
      )}
    </div>
  );
}

function SignBar({ review, onSign }: { review: Review; onSign: (outcome: "approved" | "rejected") => void }) {
  const signed = review.review;
  if (signed) {
    return (
      <div className="sign-bar">
        <p style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <StatusBadge kind={signed.outcome === "approved" ? "ok" : "fail"}>{signed.outcome === "approved" ? "Approved" : "Rejected"}</StatusBadge>
          <span>
            Signed by {signed.reviewer_name} · <Time iso={signed.signed_at} />
          </span>
          {review.signature_valid && (
            <span className="reason reason-ok">
              <ShieldCheck strokeWidth={1.5} aria-hidden="true" />
              <span>Signature valid</span>
            </span>
          )}
          {review.signature_valid === false && <StatusBadge kind="fail">Signature does not match the record</StatusBadge>}
        </p>
        <p style={{ fontSize: 13 }}>Meaning: “{signed.meaning}”</p>
        {signed.override_reason && <p style={{ fontSize: 13 }}>Approved with open checks: {signed.override_reason}</p>}
        <p style={{ fontSize: 13 }}>{signed.outcome === "approved" ? "Note" : "Reason"}: {signed.reason}</p>
        <p className="mono muted" style={{ fontSize: 11.5, overflowWrap: "anywhere" }}>
          {hashGroups(signed.record_sha256)}
        </p>
      </div>
    );
  }
  const open = review.blockers.length;
  return (
    <div className="sign-bar">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
        <p style={{ fontSize: 13.5 }}>
          {open ? `DocForge cannot approve this on its own: ${open} open check${open === 1 ? "" : "s"}.` : "All checks pass. Ready to sign."}
        </p>
        <span className="mono muted" style={{ fontSize: 11.5, whiteSpace: "nowrap" }} title={review.record_sha256}>
          sha256 {hashShort(review.record_sha256)}
        </span>
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" }}>
        <span className="muted" style={{ fontSize: 12, marginRight: "auto" }}>
          <kbd>S</kbd> sign
        </span>
        <button className="btn btn-secondary" onClick={() => onSign("rejected")}>
          Reject…
        </button>
        <button className="btn btn-primary marked" onClick={() => onSign("approved")}>
          <Marks />
          Approve…
        </button>
      </div>
    </div>
  );
}
