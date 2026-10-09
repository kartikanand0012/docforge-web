/** The small shared pieces of the design system (handoff README, Components). */

import { AlertCircle, AlertTriangle, Check, GitCompare, HelpCircle, Info, X, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { localTime } from "@/lib/format";
import { stageStep, stageWord, type StatusKind } from "@/lib/stages";

/** The registration marks: 11px crosshairs outside each corner of a `.marked` element. */
export function Marks() {
  return (
    <>
      <span className="corner tl" aria-hidden="true" />
      <span className="corner tr" aria-hidden="true" />
      <span className="corner bl" aria-hidden="true" />
      <span className="corner br" aria-hidden="true" />
    </>
  );
}

const DOC_TYPES: Record<string, string> = { invoice: "Invoice", purchase_order: "Order", coa: "CoA", general: "General" };

export function docTypeName(docType: string): string {
  return DOC_TYPES[docType] ?? docType;
}

export function Tag({ children, tone = "accent" }: { children: ReactNode; tone?: "accent" | "neutral" }) {
  return <span className={`tag tag-${tone}`}>{children}</span>;
}

export function DocTypeTag({ docType }: { docType: string }) {
  return <Tag>{docTypeName(docType)}</Tag>;
}

/** Always a word; the colour only repeats it. */
export function StatusBadge({ kind, icon: Icon, children }: { kind: StatusKind; icon?: LucideIcon; children: ReactNode }) {
  return (
    <span className={`badge badge-${kind}`}>
      {Icon && <Icon strokeWidth={1.5} aria-hidden="true" />}
      {children}
    </span>
  );
}

export function StageBars({ stage }: { stage: string }) {
  const at = stageStep(stage);
  if (!at) return null;
  return (
    <span className="stage-bars" aria-hidden="true">
      {Array.from({ length: at.of }, (_, i) => (
        <span key={i} data-done={i < at.step} />
      ))}
    </span>
  );
}

export function StageProgress({ stage }: { stage: string }) {
  const at = stageStep(stage);
  return (
    <span className="stages">
      <StageBars stage={stage} />
      <span className="muted">{at ? `${stageWord(stage)} · step ${at.step} of ${at.of}` : stageWord(stage)}</span>
    </span>
  );
}

const REASON_ICONS: Record<string, LucideIcon> = {
  "Check failed": X,
  "Uncertain value": HelpCircle,
  "Does not match its order": GitCompare,
  "Not linked yet": HelpCircle,
};

type ReasonProps = { kind: "fail" | "warn" | "info"; label: string; text: ReactNode; box?: boolean; id?: string };

export function ReasonLine({ kind, label, text, box = false, id }: ReasonProps) {
  const Icon = REASON_ICONS[label] ?? (kind === "fail" ? X : kind === "warn" ? AlertTriangle : Info);
  return (
    <div id={id} className={`reason reason-${kind}${box ? " reason-box" : ""}`}>
      <Icon strokeWidth={1.5} aria-hidden="true" />
      <p>
        <b>{label}:</b> <span>{text}</span>
      </p>
    </div>
  );
}

export function ConfidenceMeter({ value, corrected = false }: { value: number | null | undefined; corrected?: boolean }) {
  if (corrected) return <span className="badge badge-info">Corrected</span>;
  if (value === null || value === undefined) return null;
  const percent = Math.round(value * 100);
  const kind = percent >= 80 ? "ok" : "warn";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }} className="num">
      <span aria-hidden="true" style={{ width: 34, height: 4, borderRadius: 2, background: "var(--color-divider)", overflow: "hidden" }}>
        <span style={{ display: "block", height: "100%", width: `${percent}%`, background: `var(--st-${kind}-fg)` }} />
      </span>
      <span style={{ fontSize: 12, color: `var(--st-${kind}-fg)` }}>{percent}%</span>
    </span>
  );
}

const ALERT_ICONS = { fail: AlertCircle, warn: AlertTriangle, ok: Check, info: Info };

type AlertProps = { kind: "fail" | "warn" | "ok" | "info"; title: ReactNode; children?: ReactNode; action?: ReactNode };

export function Alert({ kind, title, children, action }: AlertProps) {
  const Icon = ALERT_ICONS[kind];
  return (
    <div className={`alert alert-${kind}`} role={kind === "fail" ? "alert" : "status"}>
      <Icon strokeWidth={1.5} aria-hidden="true" />
      <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
        <p>
          <b>{title}</b> {children}
        </p>
        {action && <div>{action}</div>}
      </div>
    </div>
  );
}

type PanelProps = { icon: LucideIcon; title: string; text: ReactNode; action?: ReactNode };

export function EmptyPanel({ icon: Icon, title, text, action }: PanelProps) {
  return (
    <div className="panel marked">
      <Marks />
      <Icon className="panel-icon" strokeWidth={1.5} aria-hidden="true" />
      <h2>{title}</h2>
      <p className="muted">{text}</p>
      {action}
    </div>
  );
}

type SegProps<T extends string> = {
  name: string;
  label: string;
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (value: T) => void;
};

export function Seg<T extends string>({ name, label, options, value, onChange }: SegProps<T>) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <label key={option.value} className="seg-opt">
          <input type="radio" name={name} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} />
          {option.label}
        </label>
      ))}
    </div>
  );
}

/** The viewer's local time, with the UTC instant in dateTime. */
export function Time({ iso, seconds = false }: { iso: string; seconds?: boolean }) {
  return (
    <time dateTime={iso} suppressHydrationWarning>
      {localTime(iso, { seconds })}
    </time>
  );
}
