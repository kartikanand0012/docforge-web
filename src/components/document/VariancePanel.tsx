"use client";

import Link from "next/link";
import { useId } from "react";
import { StatusBadge } from "@/components/ui";
import { count, money } from "@/lib/format";
import {
  STATUS_WORDS, differenceWords, linesMatched, percentWords, signedMoney, valueWords, type Unpaired, type Variance, type VarianceLine,
} from "@/lib/variance";  // prettier-ignore

const BADGE = { variance: "fail", within_tolerance: "ok", not_compared: "warn" } as const;

/** The bill against its PO in rupees, under Order Match: the lines that differ, each field with
 * what the PO agreed, what the bill charged and the money, its arithmetic beneath; the clean lines
 * folded behind "N lines matched"; lines on one side only listed apart, never in the net. */
export function VariancePanel({ variance }: { variance: Variance }) {
  const id = useId();
  const differing = variance.lines.filter((line) => !line.clean);
  const clean = variance.lines.filter((line) => line.clean);
  const net = Number(variance.net_impact);

  return (
    <section className="panel" aria-labelledby={`${id}-title`} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <h3 id={`${id}-title`} style={{ fontSize: 15 }}>
        Variance against the PO
      </h3>
      <dl className="variance-head" aria-label="Variance summary" style={{ display: "flex", gap: 20, flexWrap: "wrap", margin: 0 }}>
        <div>
          <dt className="muted">Invoice total</dt>
          <dd className="num">{money(variance.invoice_total)}</dd>
        </div>
        <div>
          <dt className="muted">PO total, matched lines</dt>
          <dd className="num">{money(variance.po_total)}</dd>
        </div>
        <div>
          <dt className="muted">Net variance</dt>
          <dd className="num" style={{ fontWeight: 600, color: net > 0 ? "var(--st-fail-fg)" : undefined }}>
            {signedMoney(variance.net_impact)}
            {percentWords(variance.net_percent)}
          </dd>
        </div>
      </dl>

      {differing.length === 0 ? (
        <p>
          <StatusBadge kind="ok">No variance</StatusBadge> Every paired line agrees with the PO
          {clean.some((line) => line.differences.length > 0) ? ", some within the workspace's tolerance." : "."}
        </p>
      ) : (
        <div className="table-wrap">
          <table className="table num" style={{ fontSize: 13, minWidth: 640 }} aria-label="Lines that differ">
            <thead>
              <tr>
                <th scope="col">Product</th>
                <th scope="col">Field</th>
                <th scope="col" className="right">PO</th>
                <th scope="col" className="right">Billed</th>
                <th scope="col" className="right">Difference</th>
                <th scope="col" className="right">Money impact</th>
              </tr>
            </thead>
            <tbody>{differing.flatMap((line) => rows(line))}</tbody>
          </table>
        </div>
      )}

      {clean.length > 0 && (
        <details>
          <summary>{linesMatched(clean.length)}</summary>
          <ul style={{ marginTop: 6, paddingLeft: 18, fontSize: 13 }}>
            {clean.map((line) => (
              <li key={line.line}>
                Line {line.line}: {line.product ?? "—"}
                {line.differences.map((d, i) => (
                  <span key={i} className="muted">
                    {" "}
                    · {d.note}
                  </span>
                ))}
              </li>
            ))}
          </ul>
        </details>
      )}

      <OneSided title="Not in PO" empty="Every bill line is on the PO." items={variance.not_in_po} total={variance.not_in_po_value} which="bill" />
      <OneSided title="Not billed" empty="Every PO line is on the bill." items={variance.not_billed} total={variance.not_billed_value} which="PO" />
      <p className="muted" style={{ fontSize: 12 }}>
        {variance.sign_note} The report informs you; DocForge contacts no supplier. <Link href="/exports">PO Variance Report</Link>
      </p>
    </section>
  );
}

function rows(line: VarianceLine) {
  return line.differences.map((d, index) => (
    <tr key={`${line.line}-${d.field}`}>
      <td>{index === 0 ? `${line.line}. ${line.product ?? "—"}` : ""}</td>
      <td>
        {d.label}
        {d.status !== "variance" && (
          <>
            {" "}
            <StatusBadge kind={BADGE[d.status]}>{STATUS_WORDS[d.status]}</StatusBadge>
          </>
        )}
        {(d.working || d.note || (index === 0 && line.note)) && (
          <span className="muted" style={{ display: "block", fontSize: 12 }}>
            {[d.working, d.note, index === 0 ? line.note : null].filter(Boolean).join(" · ")}
          </span>
        )}
      </td>
      <td className="right">{valueWords(d.field, d.po_value)}</td>
      <td className="right">{valueWords(d.field, d.billed_value)}</td>
      <td className="right">{differenceWords(d.field, d.difference)}</td>
      <td className="right" style={{ fontWeight: 600 }}>
        {d.money_impact === null ? "—" : signedMoney(d.money_impact)}
      </td>
    </tr>
  ));
}

function OneSided({ title, empty, items, total, which }: { title: string; empty: string; items: Unpaired[]; total: string; which: string }) {
  const id = useId();
  return (
    <section aria-labelledby={id}>
      <h4 id={id} style={{ fontSize: 14 }}>
        {title} {items.length > 0 && <span className="muted">· {count(items.length)} · {money(total)}</span>}
      </h4>
      {items.length === 0 ? (
        <p className="muted" style={{ fontSize: 13 }}>
          {empty}
        </p>
      ) : (
        <ul style={{ paddingLeft: 18, fontSize: 13 }}>
          {items.map((item) => (
            <li key={item.line}>
              {which} line {item.line}: {item.product ?? "product not read"}
              {item.working ? <span className="muted"> · {item.working}</span> : null}
              {item.note ? <span className="muted"> · {item.note}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
