"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { count, usd } from "@/lib/format";

type Stats = {
  documents: number; ready: number; awaiting_review: number; signed: number; failed: number;
  documents_last_7_days: number; median_read_seconds: number | null; model_cost_usd: number | null;
};  // prettier-ignore

/** The workspace at a glance, above the queue. An API without the figures shows nothing. */
export function StatsStrip() {
  const [stats, setStats] = useState<Stats | null>(null);
  useEffect(() => {
    api<Stats>("/stats").then(setStats, () => setStats(null));
  }, []);
  if (!stats) return null;
  const items = [
    { label: "Documents", figure: count(stats.documents), sub: `${count(stats.documents_last_7_days)} this week`, href: "/documents" },
    { label: "Need a person", figure: count(stats.awaiting_review), sub: "in the queue below" },
    { label: "Signed", figure: count(stats.signed), sub: stats.failed ? `${count(stats.failed)} could not be read` : "approved or rejected" },
    { label: "Reading time", figure: stats.median_read_seconds === null ? "—" : `${stats.median_read_seconds.toFixed(1)} s`, sub: "median per document" },
    { label: "Model cost", figure: usd(stats.model_cost_usd), sub: "all documents so far", href: "/evals" },
  ];
  return (
    <ul className="stats-strip" aria-label="This workspace at a glance">
      {items.map((item) => (
        <li key={item.label}>
          <span className="muted">{item.label}</span>
          {item.href ? (
            <Link href={item.href} className="stats-figure num">
              {item.figure}
            </Link>
          ) : (
            <span className="stats-figure num">{item.figure}</span>
          )}
          <span className="muted stats-sub">{item.sub}</span>
        </li>
      ))}
    </ul>
  );
}
