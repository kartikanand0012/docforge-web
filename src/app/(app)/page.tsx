"use client";

import { Check, RefreshCw, WifiOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, DocTypeTag, docTypeName, EmptyPanel, Marks, ReasonLine, Tag, Time } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { localTime, waiting } from "@/lib/format";
import { classify, queueSummary } from "@/lib/reasons";
import { useTitle } from "@/lib/useTitle";

type QueueItem = {
  document_id: string;
  doc_type: string;
  filename: string;
  version_no: number;
  created_at: string;
  reasons: string[];
  match_status: string;
  claimed_by?: string | null; // another reviewer has it open now
};

type Load =
  | { state: "loading" }
  | { state: "ok" }
  | { state: "error"; detail: string }
  | { state: "limited"; until: number };

const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

export default function QueuePage() {
  useTitle("Review queue");
  const router = useRouter();
  const [items, setItems] = useState<QueueItem[]>([]);
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [selected, setSelected] = useState(0);
  const [online, setOnline] = useState(true);
  const [loadedAt, setLoadedAt] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const latest = useRef(0);
  const list = useRef<HTMLUListElement>(null);

  // Each load is numbered and only the newest is shown, so a slow answer never replaces a
  // newer one. The state is set when the answer arrives.
  const apply = useCallback((ticket: number, outcome: { items?: QueueItem[]; error?: unknown }) => {
    if (ticket !== latest.current) return;
    const { items: found, error } = outcome;
    if (found) {
      setItems(found);
      setSelected((index) => Math.min(index, Math.max(found.length - 1, 0)));
      setLoadedAt(new Date().toISOString());
      setLoad({ state: "ok" });
    } else if (error instanceof ApiError && error.status === 429) {
      setLoad({ state: "limited", until: Date.now() + (error.retryAfter ?? 60) * 1000 });
    } else if (!navigator.onLine) {
      setOnline(false);
      setLoad({ state: "ok" });
    } else {
      setLoad({ state: "error", detail: error instanceof ApiError ? error.detail : "The connection failed." });
    }
  }, []);

  const fetchQueue = useCallback(() => {
    const ticket = ++latest.current;
    return api<QueueItem[]>("/review/queue").then(
      (found) => apply(ticket, { items: found }),
      (error: unknown) => apply(ticket, { error }),
    );
  }, [apply]);

  useEffect(() => {
    void fetchQueue();
  }, [fetchQueue]);

  useEffect(() => {
    const up = () => {
      setOnline(true);
      void fetchQueue();
    };
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, [fetchQueue]);

  // A rate limit counts down, then the queue reloads by itself.
  useEffect(() => {
    if (load.state !== "limited") return;
    const timer = setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= load.until) {
        clearInterval(timer);
        void fetchQueue();
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [load, fetchQueue]);

  const open = useCallback((item: QueueItem | undefined) => item && router.push(`/documents/${item.document_id}`), [router]);

  // The queue's keys act only where they belong: inside the list, or with nothing focused (J/K/O).
  // Links, buttons and fields keep their own Enter and arrows; the page keeps its scrolling.
  const onListKey = useCallback(
    (event: { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; preventDefault: () => void }) => {
      if (event.metaKey || event.ctrlKey || event.altKey || !items.length) return;
      if (event.key === "j" || event.key === "ArrowDown") setSelected((i) => Math.min(i + 1, items.length - 1));
      else if (event.key === "k" || event.key === "ArrowUp") setSelected((i) => Math.max(i - 1, 0));
      else if (event.key === "Home") setSelected(0);
      else if (event.key === "End") setSelected(items.length - 1);
      else if (event.key === "Enter" || event.key === "o") open(items[selected]);
      else return;
      event.preventDefault();
    },
    [items, selected, open],
  );
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (document.activeElement !== document.body || typing(event.target)) return;
      if (["j", "k", "o"].includes(event.key)) onListKey(event);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onListKey]);

  useEffect(() => {
    list.current?.querySelector(`[data-index="${selected}"]`)?.scrollIntoView?.({ block: "nearest" });
  }, [selected]);

  const current = items[selected];

  return (
    <div className="screen">
      <header className="screen-header">
        <div>
          <h1>Review queue</h1>
          <p className="sub num">{load.state === "ok" && items.length ? queueSummary(items) : "Documents that need a person, oldest first"}</p>
        </div>
        <p className="muted" style={{ fontSize: 12.5 }}>
          <kbd>J</kbd> <kbd>K</kbd> move · <kbd>Enter</kbd> open
        </p>
      </header>

      {!online && (
        <div className="offline-strip" role="status">
          <WifiOff size={16} strokeWidth={1.5} aria-hidden="true" />
          <p>
            <b>You are offline.</b> This is the queue as of {loadedAt ? localTime(loadedAt) : "your last visit"}. It refreshes when you
            reconnect; signing waits until then.
          </p>
        </div>
      )}

      {load.state === "loading" && (
        <ul className="queue-list" aria-busy="true" aria-label="Loading the review queue">
          {Array.from({ length: 6 }, (_, i) => (
            <li key={i} className="queue-row">
              <span className="skeleton" style={{ width: 64, height: 18 }} />
              <span style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <span className="skeleton" style={{ width: "50%", height: 16 }} />
                <span className="skeleton" style={{ width: "80%", height: 12 }} />
              </span>
              <span className="skeleton" style={{ width: 90, height: 12, justifySelf: "end" }} />
            </li>
          ))}
        </ul>
      )}

      {load.state === "error" && (
        <div className="screen-body">
          <Alert
            kind="fail"
            title="The review queue could not be loaded."
            action={
              <button className="btn btn-secondary" onClick={() => void fetchQueue()}>
                <RefreshCw size={14} strokeWidth={1.5} aria-hidden="true" /> Try again
              </button>
            }
          >
            {load.detail}
          </Alert>
        </div>
      )}

      {load.state === "limited" && (
        <div className="screen-body">
          <Alert kind="warn" title="Too many requests in the last minute.">
            Try again in {Math.max(0, Math.ceil((load.until - now) / 1000))} seconds. The queue reloads by itself then.
          </Alert>
        </div>
      )}

      {load.state === "ok" && !items.length && (
        <EmptyPanel
          icon={Check}
          title="Nothing waits for a person"
          text="Every document read so far passed its checks or has been signed. New documents that need a person appear here as soon as they are checked."
          action={
            <Link className="btn btn-secondary" href="/upload">
              Upload documents
            </Link>
          }
        />
      )}

      {load.state === "ok" && items.length > 0 && (
        <div className="queue">
          <ul
            ref={list}
            className="queue-list"
            role="listbox"
            aria-label="Documents that need a person"
            tabIndex={0}
            aria-activedescendant={current ? `queue-${current.document_id}` : undefined}
            onKeyDown={(event) => event.target === event.currentTarget && onListKey(event)}
          >
            {items.map((item, index) => (
              <li
                key={item.document_id}
                id={`queue-${item.document_id}`}
                data-index={index}
                role="option"
                aria-selected={index === selected}
                className="queue-row"
                onClick={() => setSelected(index)}
                onDoubleClick={() => open(item)}
              >
                <div className="queue-type">
                  <DocTypeTag docType={item.doc_type} />
                  {item.version_no > 1 && <span className="muted" style={{ fontSize: 12 }}>Version {item.version_no}</span>}
                  {item.claimed_by && <Tag tone="neutral">In review by {item.claimed_by}</Tag>}
                </div>
                <div className="queue-main">
                  <p className="queue-file">
                    {/* A real link: one tap opens it, on touch screens and with switch or voice control. */}
                    <Link href={`/documents/${item.document_id}`} tabIndex={-1} onClick={(event) => event.stopPropagation()}>
                      {item.filename}
                    </Link>
                  </p>
                  {item.reasons.map((reason) => {
                    const why = classify(reason);
                    return <ReasonLine key={reason} kind={why.kind} label={why.label} text={why.text} />;
                  })}
                </div>
                <div className="queue-when">
                  <span>{waiting(item.created_at, new Date(now))}</span>
                  <span className="muted">
                    <Time iso={item.created_at} />
                  </span>
                </div>
              </li>
            ))}
          </ul>

          {current && (
            <aside className="queue-preview" aria-label="Selected document">
              <p className="group-label" style={{ fontSize: 11 }}>
                {docTypeName(current.doc_type)} · {selected + 1} of {items.length}
              </p>
              <h2 style={{ fontSize: 24, overflowWrap: "anywhere" }}>{current.filename}</h2>
              <h3 className="group-label" style={{ marginTop: 10 }}>Why a person is needed</h3>
              {current.reasons.map((reason) => {
                const why = classify(reason);
                return <ReasonLine key={reason} kind={why.kind} label={why.label} text={why.text} box />;
              })}
              <dl className="details">
                <dt>Received</dt>
                <dd>
                  <Time iso={current.created_at} />
                </dd>
                <dt>Version</dt>
                <dd>{current.version_no}</dd>
              </dl>
              <button className="btn btn-primary marked" onClick={() => open(current)}>
                <Marks />
                Open document <kbd>Enter</kbd>
              </button>
            </aside>
          )}
        </div>
      )}
    </div>
  );
}
