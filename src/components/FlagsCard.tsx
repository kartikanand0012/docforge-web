"use client";

import { useEffect, useRef, useState } from "react";
import { Alert, Seg } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { caughtList, dayWords, lastDays, plural, type FlagsSummary } from "@/lib/flags";

type Range = "7" | "30" | "90";
const RANGES: { value: Range; label: string }[] = [
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
];

/** What DocForge caught on the workspace's own bills, as a count an owner can repeat. The last
 * 30 days is the API's own default; an API without the summary shows nothing. */
export function FlagsCard() {
  const [range, setRange] = useState<Range>("30");
  const [summary, setSummary] = useState<FlagsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const loads = useRef(0);

  useEffect(() => {
    const ticket = ++loads.current;
    const query = range === "30" ? "" : `?${new URLSearchParams(lastDays(Number(range)))}`;
    api<FlagsSummary>(`/flags/summary${query}`).then(
      (found) => {
        if (ticket !== loads.current) return;
        setSummary(found);
        setError(null);
        setBusy(false);
      },
      (caught: unknown) => {
        if (ticket !== loads.current) return;
        setError(caught instanceof ApiError ? caught.detail : "The counts could not be loaded.");
        setBusy(false);
      },
    );
  }, [range]);

  // Never loaded: an older API, or none to show.
  if (!summary) return null;
  const atLeast = summary.capped ? "at least " : "";
  const more = summary.capped ? "+" : "";
  const figures = [
    { figure: summary.duplicates, text: plural(summary.duplicates, "possible duplicate", "possible duplicates"), sub: "approval needs a reason" },
    { figure: summary.near_expiry_lines, text: plural(summary.near_expiry_lines, "near-expiry line", "near-expiry lines"), sub: `on ${plural(summary.near_expiry_bills, "bill", "bills")}` },
    { figure: summary.schedule_h1_lines, text: plural(summary.schedule_h1_lines, "Schedule H1 line", "Schedule H1 lines"), sub: `on ${plural(summary.schedule_h1_bills, "bill", "bills")}` },
  ];

  return (
    <section className="flags-card" aria-labelledby="flags-card-title" aria-busy={busy}>
      <div className="flags-card-head">
        <h2 id="flags-card-title">Caught on your bills</h2>
        <Seg
          name="flags-range"
          label="How far back"
          value={range}
          onChange={(value) => {
            setBusy(true);
            setRange(value);
          }}
          options={RANGES}
        />
      </div>
      <p>
        On {plural(summary.invoices, "invoice", "invoices")} received {dayWords(summary.from)} to {dayWords(summary.to)}, DocForge caught {atLeast}
        {caughtList(summary)}.
      </p>
      <ul className="stats-strip flags-figures">
        {figures.map((item) => (
          <li key={item.text}>
            <span className="stats-figure num" aria-hidden="true">
              {item.figure.toLocaleString("en-IN")}
              {more}
            </span>
            <span>{item.text}</span>
            <span className="muted stats-sub">{item.sub}</span>
          </li>
        ))}
      </ul>
      {summary.capped && (
        <p className="muted" style={{ fontSize: 12.5 }}>
          There were more invoices in this range than were counted ({summary.invoices.toLocaleString("en-IN")}), so the real numbers may be higher.
        </p>
      )}
      {error && <Alert kind="warn" title="Not updated.">{error}</Alert>}
    </section>
  );
}
