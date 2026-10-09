"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Alert, DocTypeTag, Marks, Seg, StageProgress, StatusBadge, Time } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { IN_PROGRESS, isFinished, stageKind, stageWord } from "@/lib/stages";
import { useLiveStages } from "@/lib/useLiveStages";

type Item = {
  id: string; filename: string; doc_type: string; status: string; stage: string; ready_for_chat: boolean;
  page_count: number | null; created_at: string;
};  // prettier-ignore
type Page = { items: Item[]; next_before: string | null };

const TYPES = [
  { value: "", label: "All" },
  { value: "invoice", label: "Invoices" },
  { value: "purchase_order", label: "Orders" },
  { value: "coa", label: "CoAs" },
  { value: "general", label: "General" },
];
const STAGES = ["stored", "converting", "parsing", "extracting", "checking", "indexing", "retrying", "ready", "processed", "failed"];

export default function DocumentsPage() {
  return (
    <Suspense fallback={<div className="screen" aria-busy="true" />}>
      <Documents />
    </Suspense>
  );
}

function Documents() {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const type = search.get("type") ?? "";
  const stage = search.get("stage") ?? "";
  const [items, setItems] = useState<Item[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [error, setError] = useState("");
  const [more, setMore] = useState(false);
  const loads = useRef(0);

  const query = (before?: string) => {
    const params = new URLSearchParams({ limit: "50" });
    if (type) params.set("doc_type", type);
    if (stage) params.set("stage", stage);
    if (before) params.set("before", before);
    return `/documents?${params}`;
  };

  useEffect(() => {
    const ticket = ++loads.current;
    const params = new URLSearchParams({ limit: "50" });
    if (type) params.set("doc_type", type);
    if (stage) params.set("stage", stage);
    api<Page>(`/documents?${params}`).then(
      (page) => {
        if (ticket !== loads.current) return;
        setItems(page.items);
        setNext(page.next_before);
        setState("ok");
      },
      (caught: unknown) => {
        if (ticket !== loads.current) return;
        setError(caught instanceof ApiError ? caught.detail : "The documents could not be loaded.");
        setState("error");
      },
    );
  }, [type, stage]);

  const loadMore = async () => {
    if (!next) return;
    setMore(true);
    try {
      const page = await api<Page>(query(next));
      // Older rows go after the ones shown, each once.
      setItems((current) => [...current, ...page.items.filter((item) => !current.some((shown) => shown.id === item.id))]);
      setNext(page.next_before);
    } finally {
      setMore(false);
    }
  };

  const inProgress = useMemo(() => items.filter((item) => IN_PROGRESS.has(item.stage)).map((item) => item.id), [items]);
  const live = useLiveStages(inProgress);

  const setFilter = (name: string, value: string) => {
    const params = new URLSearchParams(search);
    if (value) params.set(name, value);
    else params.delete(name);
    router.replace(`${pathname}${params.size ? `?${params}` : ""}`);
  };

  return (
    <div className="screen">
      <header className="screen-header">
        <div>
          <h1>Documents</h1>
          <p className="sub">Every document in the organisation, newest first. Where each one is updates live.</p>
        </div>
        <Link className="btn btn-primary marked" href="/upload">
          <Marks />
          Upload documents
        </Link>
      </header>
      <div className="screen-body">
        <div className="filters">
          <Seg name="doc-type" label="Document type" value={type} onChange={(value) => setFilter("type", value)} options={TYPES} />
          <label className="filter-select">
            <span className="label">Where it is</span>
            <select className="input" value={stage} onChange={(e) => setFilter("stage", e.target.value)}>
              <option value="">Any stage</option>
              {STAGES.map((value) => (
                <option key={value} value={value}>
                  {stageWord(value)}
                </option>
              ))}
            </select>
          </label>
          <span className="muted" style={{ marginLeft: "auto" }}>
            Showing {items.length}
          </span>
        </div>

        {state === "error" && <Alert kind="fail" title="The documents could not be loaded.">{error}</Alert>}
        {state === "loading" && <p className="muted" aria-busy="true">Loading…</p>}
        {state === "ok" && !items.length && <p className="muted">No documents match these filters.</p>}

        {items.length > 0 && (
          <div className="table-wrap">
            <table className="table" style={{ minWidth: 860 }}>
              <thead>
                <tr>
                  <th scope="col">Document</th>
                  <th scope="col">Type</th>
                  <th scope="col">Where it is</th>
                  <th scope="col" className="right">Pages</th>
                  <th scope="col">Chat</th>
                  <th scope="col">Received</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const now = live[item.id]?.stage ?? item.stage;
                  return (
                    <tr key={item.id}>
                      <td>
                        <Link href={`/documents/${item.id}`} style={{ fontWeight: 500, overflowWrap: "anywhere" }}>
                          {item.filename}
                        </Link>
                      </td>
                      <td>
                        <DocTypeTag docType={item.doc_type} />
                      </td>
                      <td>
                        {isFinished(now) ? <StatusBadge kind={stageKind(now)}>{stageWord(now)}</StatusBadge> : <StageProgress stage={now} />}
                        {!isFinished(now) && now !== "retrying" && <p className="muted" style={{ fontSize: 12 }}>Updating live</p>}
                        {now === "retrying" && <p className="muted" style={{ fontSize: 12 }}>A service did not answer; it will try again. Nothing to do.</p>}
                        {now === "failed" && <p className="muted" style={{ fontSize: 12 }}>Open it to see why.</p>}
                      </td>
                      <td className="right num">{item.page_count ?? "—"}</td>
                      <td>{item.ready_for_chat || now === "ready" ? "Can be asked" : now === "processed" ? "Not indexed" : "—"}</td>
                      <td className="num">
                        <Time iso={item.created_at} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {state === "ok" && items.length > 0 && (
          <div style={{ textAlign: "center" }}>
            {next ? (
              <button className="btn btn-secondary" onClick={() => void loadMore()} disabled={more}>
                {more ? "Loading…" : "Load more"}
              </button>
            ) : (
              <p className="muted">That is every document.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
