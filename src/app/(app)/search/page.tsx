"use client";

import { Search as SearchIcon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { Alert, DocTypeTag, Seg, Tag } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import type { CitationBox } from "@/lib/chat";
import { marked, searchSummary } from "@/lib/search";
import { useTitle } from "@/lib/useTitle";

// matched_words: the passage contains a word of the search, not only something close in meaning.
type Result = { document_id: string; filename: string; doc_type: string; page: number; text: string; score: number; matched_words?: boolean; boxes: CitationBox[] };
type Answer = { query: string; mode: string; words_only: boolean; results: Result[] };
type Mode = "hybrid" | "keyword";

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="screen" aria-busy="true" />}>
      <Search />
    </Suspense>
  );
}

function Search() {
  useTitle("Search");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const mode = (params.get("mode") as Mode) || "hybrid";
  const type = params.get("type") ?? "";
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const latest = useRef(0);
  const urlQuery = params.get("q") ?? "";

  const setParam = (name: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value);
    else next.delete(name);
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`);
  };

  // The URL follows the typing after a pause; the search follows the URL.
  useEffect(() => {
    if (q.trim() === urlQuery) return;
    const timer = setTimeout(() => {
      const next = new URLSearchParams(params);
      if (q.trim()) next.set("q", q.trim());
      else next.delete("q");
      router.replace(`${pathname}${next.size ? `?${next}` : ""}`);
    }, 250);
    return () => clearTimeout(timer);
  }, [q, urlQuery, params, pathname, router]);

  useEffect(() => {
    const ticket = ++latest.current;
    if (!urlQuery) {
      queueMicrotask(() => ticket === latest.current && setAnswer(null));
      return;
    }
    const search = new URLSearchParams({ q: urlQuery, mode, k: "20" });
    if (type) search.set("doc_type", type);
    queueMicrotask(() => ticket === latest.current && setBusy(true));
    api<Answer>(`/search?${search}`)
      .then(
        (found) => {
          if (ticket !== latest.current) return;
          setAnswer(found);
          setError(null);
        },
        (caught: unknown) => {
          if (ticket !== latest.current) return;
          setError(
            caught instanceof ApiError && caught.status === 429
              ? `Too many searches in a minute. Try again in ${caught.retryAfter ?? 60} seconds.`
              : caught instanceof ApiError
                ? caught.detail
                : "The search did not reach DocForge.",
          );
        },
      )
      .finally(() => ticket === latest.current && setBusy(false));
  }, [urlQuery, mode, type]);

  const results = answer?.results ?? [];
  const worded = results.filter((result) => result.matched_words !== false).length;

  const open = (result: Result) => {
    try {
      sessionStorage.setItem(
        `docforge.highlight.${result.document_id}`,
        JSON.stringify({ boxes: result.boxes, label: "Match", quote: result.text.slice(0, 160), source: "search result", page: result.page }),
      );
    } catch {
      /* the page opens without the outline */
    }
    router.push(`/documents/${result.document_id}?page=${result.page}`);
  };

  return (
    <div className="screen">
      <header className="screen-header">
        <div>
          <h1>Search</h1>
          <p className="sub">Find passages across every document. Each result opens on its page with the passage outlined.</p>
        </div>
      </header>
      <div className="screen-body" style={{ maxWidth: 980 }}>
        <form role="search" className="search-form" onSubmit={(event) => event.preventDefault()}>
          <label htmlFor="search-q" className="sr-only">
            Search the documents
          </label>
          <div className="search-input">
            <SearchIcon size={16} strokeWidth={1.5} aria-hidden="true" />
            <input id="search-q" className="input" type="search" placeholder="Words, numbers, a batch, a GSTIN…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          </div>
          <Seg
            name="search-mode"
            label="How to match"
            value={mode}
            onChange={(value) => setParam("mode", value === "hybrid" ? "" : value)}
            options={[
              { value: "hybrid", label: "Words and meaning" },
              { value: "keyword", label: "Exact words" },
            ]}
          />
          <label className="sr-only" htmlFor="search-type">
            Document type
          </label>
          <select id="search-type" className="input" style={{ width: "auto" }} value={type} onChange={(e) => setParam("type", e.target.value)}>
            <option value="">All types</option>
            <option value="invoice">Invoices</option>
            <option value="purchase_order">Orders</option>
            <option value="coa">CoAs</option>
            <option value="general">General</option>
          </select>
        </form>

        {answer?.words_only && (
          <Alert kind="warn" title="Only exact words were matched.">
            Meaning-based search is unavailable right now, so passages that say the same thing in other words may be missing.
          </Alert>
        )}
        {error && <Alert kind="fail" title="Not searched.">{error}</Alert>}

        <p className="muted" role="status" aria-live="polite">
          {!urlQuery
            ? "Type to search…"
            : busy && !answer
              ? "Searching…"
              : searchSummary(results, urlQuery)}
        </p>

        {answer && urlQuery && !worded && (
          <div className="panel" style={{ margin: "12px 0" }}>
            <h2>No passages contain “{urlQuery}”</h2>
            <p className="muted">
              Try fewer words, another spelling, or all types.
              {results.length > 0 && " Below are the passages closest in meaning, which may not be related."}
            </p>
          </div>
        )}

        <ol className="results">
          {answer?.results.map((result, index) => (
            <li key={`${result.document_id}-${result.page}-${index}`}>
              <button className="result" onClick={() => open(result)}>
                <span className="result-head">
                  <span style={{ fontWeight: 500 }}>{result.filename}</span>
                  <DocTypeTag docType={result.doc_type} />
                  <span className="muted">Page {result.page}</span>
                  <span style={{ marginLeft: "auto" }}>
                    {result.matched_words === false ? <Tag tone="neutral">Close in meaning</Tag> : <Tag>Has your words</Tag>}
                  </span>
                </span>
                <span className="result-text num">
                  {marked(result.text, urlQuery).map((segment, i) => (segment.match ? <mark key={i}>{segment.text}</mark> : <span key={i}>{segment.text}</span>))}
                </span>
                <span className="go" style={{ fontSize: 12, color: "var(--color-accent-700)" }}>
                  Show on page →
                </span>
              </button>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
