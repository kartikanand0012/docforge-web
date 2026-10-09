"use client";

import { ShieldCheck } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { Alert, Denied, Time } from "@/components/ui";
import { ApiError, api, apiUrl } from "@/lib/api";
import { chainNote, detailsText, filtersFromQuery, filtersToQuery, localDayRange, localDaysFromRange, type ChainReport } from "@/lib/audit";
import { useTitle } from "@/lib/useTitle";

type Entry = {
  id: number; occurred_at: string; actor: string; actor_name: string; action: string; action_label: string;
  target_type: string | null; target_id: string | null; target_label: string | null; details: Record<string, unknown>; hidden_details: number;
};  // prettier-ignore
type Page = { items: Entry[]; next_before: number | null };
type Choice = { value: string; label: string };

export default function AuditPage() {
  return (
    <Suspense fallback={<div className="screen" aria-busy="true" />}>
      <Audit />
    </Suspense>
  );
}

function Audit() {
  useTitle("Audit log");
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const filters = filtersFromQuery(search);
  const query = filtersToQuery(filters);
  const [choices, setChoices] = useState<{ actions: Choice[]; actors: Choice[] }>({ actions: [], actors: [] });
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [next, setNext] = useState<number | null>(null);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chain, setChain] = useState<{ state: "idle" | "checking" | "done" | "error"; report?: ChainReport; text?: string }>({ state: "idle" });
  const [exportNote, setExportNote] = useState<string | null>(null);
  const loads = useRef(0);
  const [more, setMore] = useState(false);
  const days = localDaysFromRange(filters.from, filters.to);

  useEffect(() => {
    api<{ actions: Choice[]; actors: Choice[] }>("/audit/filters").then(setChoices, (caught: unknown) => {
      if (caught instanceof ApiError && caught.status === 403) setDenied(true);
    });
  }, []);

  useEffect(() => {
    const ticket = ++loads.current;
    api<Page>(`/audit?limit=50${query ? `&${query}` : ""}`).then(
      (page) => {
        if (ticket !== loads.current) return;
        setEntries(page.items);
        setNext(page.next_before);
        setError(null);
      },
      (caught: unknown) => {
        if (ticket !== loads.current) return;
        if (caught instanceof ApiError && caught.status === 403) setDenied(true);
        else setError(caught instanceof ApiError ? caught.detail : "The audit log could not be loaded.");
      },
    );
  }, [query]);

  if (denied) return <Denied />;

  const setFilters = (change: Partial<typeof filters>) => {
    const merged = { ...filters, ...change };
    const text = filtersToQuery(merged);
    router.replace(`${pathname}${text ? `?${text}` : ""}`);
  };

  const verify = async () => {
    setChain({ state: "checking" });
    try {
      const report = await api<ChainReport>("/audit/verification");
      setChain({ state: "done", report });
    } catch (caught) {
      setChain({
        state: "error",
        text: caught instanceof ApiError && caught.status === 429 ? "Chain checks are limited to 6 a minute." : caught instanceof ApiError ? caught.detail : "The check did not run.",
      });
    }
  };

  const exportCsv = async () => {
    setExportNote(null);
    let response: Response;
    try {
      response = await fetch(apiUrl(`/audit/export.csv${query ? `?${query}` : ""}`), { cache: "no-store" });
    } catch {
      return setExportNote("The export did not reach DocForge. Try again.");
    }
    if (!response.ok) return setExportNote(response.status === 429 ? "Exports are limited to 6 a minute." : "The export did not run.");
    const blob = await response.blob();
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "docforge-audit-log.csv";
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 10_000); // some browsers read it after the click
    if (response.headers.get("x-docforge-truncated") === "true") setExportNote("The export stopped at 10,000 rows. Narrow the dates to get the rest.");
  };

  return (
    <div className="screen">
      <header className="screen-header">
        <div>
          <h1>Audit log</h1>
          <p className="sub">Every action in the organisation, append-only and hash-chained.</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-secondary" onClick={() => void exportCsv()}>
            Export CSV
          </button>
          <button className="btn btn-primary" onClick={() => void verify()} disabled={chain.state === "checking"}>
            <ShieldCheck size={14} strokeWidth={1.5} aria-hidden="true" /> Verify the chain
          </button>
        </div>
      </header>
      <div className="screen-body">
        <div aria-live="polite">
          {chain.state === "checking" && <p className="muted">Checking every entry&apos;s hash against the one before it…</p>}
          {chain.state === "done" && chain.report && (
            <Alert kind={chain.report.consistent ? "ok" : "fail"} title={chain.report.consistent ? "Chain intact." : "Chain broken."}>
              {chainNote(chain.report)}
            </Alert>
          )}
          {chain.state === "error" && <Alert kind="warn" title="Not checked.">{chain.text}</Alert>}
          {exportNote && <Alert kind="warn" title="Export.">{exportNote}</Alert>}
        </div>

        <div className="filters">
          <label className="filter-select">
            <span className="label">Action</span>
            <select className="input" value={filters.action ?? ""} onChange={(e) => setFilters({ action: e.target.value || undefined })}>
              <option value="">Any action</option>
              {choices.actions.map((choice) => (
                <option key={choice.value} value={choice.value}>
                  {choice.label}
                </option>
              ))}
            </select>
          </label>
          <label className="filter-select">
            <span className="label">Who</span>
            <select className="input" value={filters.actor ?? ""} onChange={(e) => setFilters({ actor: e.target.value || undefined })}>
              <option value="">Anyone</option>
              {choices.actors.map((choice) => (
                <option key={choice.value} value={choice.value}>
                  {choice.label}
                </option>
              ))}
            </select>
          </label>
          <label className="filter-select">
            <span className="label">From</span>
            <input className="input" type="date" value={days.fromDay} onChange={(e) => setFilters(localDayRange(e.target.value, days.toDay))} />
          </label>
          <label className="filter-select">
            <span className="label">To, including</span>
            <input className="input" type="date" value={days.toDay} onChange={(e) => setFilters(localDayRange(days.fromDay, e.target.value))} />
          </label>
          <button className="btn btn-ghost" onClick={() => router.replace(pathname)}>
            Clear filters
          </button>
        </div>

        {error && <Alert kind="fail" title="Not loaded.">{error}</Alert>}
        {entries && !entries.length && <p className="muted">No entries match these filters.</p>}
        {entries && entries.length > 0 && (
          <div className="table-wrap">
            <table className="table" style={{ minWidth: 900, fontSize: 13 }}>
              <thead>
                <tr>
                  <th scope="col" className="right">Entry</th>
                  <th scope="col">When</th>
                  <th scope="col">Who</th>
                  <th scope="col">Action</th>
                  <th scope="col">On</th>
                  <th scope="col">Details</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id}>
                    <td className="right mono">{entry.id}</td>
                    <td className="num" style={{ whiteSpace: "nowrap" }}>
                      <Time iso={entry.occurred_at} seconds />
                    </td>
                    <td>{entry.actor_name}</td>
                    <td style={{ fontWeight: 500 }}>{entry.action_label}</td>
                    <td style={{ overflowWrap: "anywhere" }}>{entry.target_label ?? "—"}</td>
                    <td className="muted" style={{ overflowWrap: "anywhere" }}>{detailsText(entry.details, entry.hidden_details)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {entries && entries.length > 0 && next !== null && (
          <button
            className="btn btn-secondary"
            style={{ alignSelf: "center" }}
            disabled={more}
            onClick={async () => {
              const ticket = loads.current;
              setMore(true);
              try {
                const page = await api<Page>(`/audit?limit=50&before=${next}${query ? `&${query}` : ""}`);
                if (ticket !== loads.current) return;
                setEntries((current) => {
                  const seen = new Set((current ?? []).map((entry) => entry.id));
                  return [...(current ?? []), ...page.items.filter((entry) => !seen.has(entry.id))];
                });
                setNext(page.next_before);
              } catch (caught) {
                setError(caught instanceof ApiError ? caught.detail : "More entries could not be loaded.");
              } finally {
                setMore(false);
              }
            }}
          >
            {more ? "Loading…" : "Load more"}
          </button>
        )}
      </div>
    </div>
  );
}
