"use client";

import { useId, useState, type FormEvent } from "react";
import { SampleWarning } from "@/components/profiles/SampleWarning";
import { Alert, Seg, StatusBadge } from "@/components/ui";
import { ApiError } from "@/lib/api";
import {
  SOURCE_GROUPS, basisOf, createProfile, fromPick, isField, kindOf, pickLabel, pickValue, sameColumn, saveVersion, specFromDraft,
  type Draft, type DraftColumn, type DraftSettings, type FieldDef, type MargProfile,
} from "@/lib/profiles";  // prettier-ignore

const DELIMITERS: { value: DraftSettings["delimiter"]; label: string }[] = [
  { value: ",", label: "Comma ( , )" },
  { value: ";", label: "Semicolon ( ; )" },
  { value: "\t", label: "Tab" },
  { value: "|", label: "Pipe ( | )" },
];

const DECIMALS = ["", "0", "1", "2", "3", "4", "5", "6"];

type Target = { kind: "new" } | { kind: "version"; id: string };

/** A layout to check and save: every column's source, how it is written, and the file's own
 * settings. What the file reading offered is filled in and marked as a suggestion; a column
 * with no offer is left for the person to choose, and nothing is saved until all are chosen. */
export function ProfileEditor({
  draft: initial, fields, profiles, editing = null, onSaved, onCancel,
}: { draft: Draft; fields: FieldDef[]; profiles: MargProfile[]; editing?: string | null; onSaved: (saved: MargProfile) => void; onCancel: () => void }) {  // prettier-ignore
  const [settings, setSettings] = useState<DraftSettings>(initial.settings);
  const [columns, setColumns] = useState<DraftColumn[]>(initial.columns);
  const [target, setTarget] = useState<Target>(editing ? { kind: "version", id: editing } : { kind: "new" });
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [unset, setUnset] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const id = useId();
  const draft: Draft = { ...initial, settings, columns };
  const sample = initial.origin === "sample";

  const change = (index: number, update: Partial<DraftColumn>) => {
    setColumns((current) => current.map((column, at) => (at === index ? { ...column, ...update } : column)));
    setUnset((current) => current.filter((at) => at !== index));
    setError(null);
  };
  const set = <K extends keyof DraftSettings>(key: K, value: DraftSettings[K]) => {
    setSettings((current) => ({ ...current, [key]: value }));
    setError(null);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const made = specFromDraft(draft);
    if ("error" in made) {
      setUnset(made.unset);
      return setError(made.error);
    }
    if (target.kind === "new" && !name.trim()) return setError("Name the profile, for example the name of your shop's Marg setup.");
    setBusy(true);
    setError(null);
    try {
      const basis = basisOf(draft);
      onSaved(target.kind === "new" ? await createProfile(name.trim(), basis, made.spec) : await saveVersion(target.id, basis, made.spec));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.detail : "The profile was not saved. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="section-card" onSubmit={save} noValidate aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} style={{ fontSize: 18 }}>
        {sample ? "The SAMPLE layout" : initial.origin === "upload" ? "The layout of your file" : "Edit the layout"}
      </h2>
      {sample ? (
        <p style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <b>{initial.title}</b> <SampleWarning />
        </p>
      ) : (
        <p className="muted">
          {initial.origin === "upload"
            ? `Read from ${initial.title}. Each suggested source is a guess from the file: check every column. Columns with no suggestion need you to choose.`
            : `From ${initial.title}. Saving makes a new version; past exports keep the version they used.`}
        </p>
      )}

      <fieldset className="profile-settings">
        <legend>The file</legend>
        <div className="field">
          <label htmlFor={`${id}-type`}>File type</label>
          <select id={`${id}-type`} className="input" value={settings.file_type} onChange={(e) => set("file_type", e.target.value as DraftSettings["file_type"])}>
            <option value="csv">CSV</option>
            <option value="xlsx">Excel (.xlsx)</option>
          </select>
        </div>
        {settings.file_type === "csv" ? (
          <div className="field">
            <label htmlFor={`${id}-delimiter`}>Separator</label>
            <select id={`${id}-delimiter`} className="input" value={settings.delimiter} onChange={(e) => set("delimiter", e.target.value as DraftSettings["delimiter"])}>
              {DELIMITERS.map((option) => (
                <option key={option.label} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="field">
            <label htmlFor={`${id}-sheet`}>Sheet name</label>
            <input id={`${id}-sheet`} className="input" value={settings.sheet_name} maxLength={31} onChange={(e) => set("sheet_name", e.target.value)} />
          </div>
        )}
        <div className="field">
          <label htmlFor={`${id}-layout`}>Rows</label>
          <select id={`${id}-layout`} className="input" value={settings.layout} onChange={(e) => set("layout", e.target.value as DraftSettings["layout"])}>
            <option value="per_line">One row per bill line (batch-wise)</option>
            <option value="per_invoice">One row per bill</option>
          </select>
        </div>
        <label className="check">
          <input type="checkbox" checked={settings.header_row} onChange={(e) => set("header_row", e.target.checked)} /> The first row is the headers
        </label>
        {settings.layout === "per_line" && (
          <div className="field">
            <span className="label">Free (scheme) quantity</span>
            <Seg
              name={`${id}-free`}
              label="Free (scheme) quantity"
              value={settings.free_qty}
              onChange={(value) => set("free_qty", value)}
              options={[
                { value: "column", label: "Its own column" },
                { value: "row", label: "Its own row" },
              ]}
            />
          </div>
        )}
      </fieldset>

      <h3 style={{ fontSize: 15 }}>Columns, in the file&apos;s order</h3>
      <ol className="profile-columns">
        {columns.map((column, index) => (
          <li key={index}>
            <ColumnCard
              column={column}
              number={index + 1}
              fields={fields}
              layout={settings.layout}
              missing={unset.includes(index)}
              onChange={(update) => change(index, update)}
            />
          </li>
        ))}
      </ol>

      <fieldset className="profile-settings">
        <legend>Save</legend>
        <div className="field">
          <label htmlFor={`${id}-target`}>Save as</label>
          <select
            id={`${id}-target`}
            className="input"
            value={target.kind === "new" ? "" : target.id}
            onChange={(e) => setTarget(e.target.value ? { kind: "version", id: e.target.value } : { kind: "new" })}
          >
            <option value="">A new profile</option>
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                The next version of ‘{profile.name}’
              </option>
            ))}
          </select>
        </div>
        {target.kind === "new" && (
          <div className="field">
            <label htmlFor={`${id}-name`}>Profile name</label>
            <input id={`${id}-name`} className="input" value={name} maxLength={200} onChange={(e) => setName(e.target.value)} autoComplete="off" />
          </div>
        )}
      </fieldset>
      {sample && <p className="muted">Saved from the SAMPLE layout, the profile stays marked SAMPLE: try the engine with it, not your books.</p>}
      {error && (
        <Alert kind="fail" title="Not saved.">
          {error}
        </Alert>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Saving…" : "Save profile"}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function ColumnCard({
  column, number, fields, layout, missing, onChange,
}: { column: DraftColumn; number: number; fields: FieldDef[]; layout: DraftSettings["layout"]; missing: boolean; onChange: (update: Partial<DraftColumn>) => void }) {  // prettier-ignore
  const id = useId();
  const kind = kindOf(fields, column);
  const suggested = column.offered !== null && column.source !== null && sameColumn({ ...column, source: column.source }, column.offered);
  const title = column.header || `Column ${number}`;
  const current = pickValue(column);

  const pick = (value: string) => {
    const chosen = fromPick(value);
    if (!chosen) return onChange({ source: null, field: null });
    const next = kindOf(fields, chosen);
    onChange({
      ...chosen,
      value: chosen.source === "constant" ? (column.value ?? "") : null,
      // An Excel date cell only holds a date.
      cell: column.cell === "date" && next !== "date" && next !== "month" ? "text" : column.cell,
    });
  };
  const format = (update: Partial<DraftColumn["format"]>) => onChange({ format: { ...column.format, ...update } });

  return (
    <fieldset className={`task-card profile-column${missing ? " profile-column-missing" : ""}`}>
      <legend>
        <span className="muted num">{number}.</span> <b>{title}</b>
      </legend>
      <p className="muted" style={{ overflowWrap: "anywhere" }}>
        {column.examples.length ? `In the file: ${column.examples.map((example) => `‘${example}’`).join(", ")}` : "No examples"}
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {suggested && <StatusBadge kind="info">Suggested from the file: check it</StatusBadge>}
        {column.offered !== null && !suggested && column.source !== null && <span className="muted">Changed from the suggestion ({pickLabel(fields, column.offered)})</span>}
        {column.source === null && <StatusBadge kind="warn">Not chosen: choose where this comes from</StatusBadge>}
      </div>
      <div className="mapping-fields">
        <div className="field">
          <label htmlFor={`${id}-header`}>Header</label>
          <input id={`${id}-header`} className="input" value={column.header} maxLength={100} onChange={(e) => onChange({ header: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor={`${id}-takes`}>Takes</label>
          <select id={`${id}-takes`} className="input" value={current} onChange={(e) => pick(e.target.value)} aria-invalid={missing ? true : undefined}>
            <option value="">Choose…</option>
            {SOURCE_GROUPS.map((group) => {
              const options = fields.filter(
                (candidate) => candidate.source === group.source && (layout === "per_line" || !candidate.per_line_only || `${candidate.source}:${candidate.field}` === current),
              );
              return options.length ? (
                <optgroup key={group.source} label={group.label}>
                  {options.map((candidate) => (
                    <option key={candidate.field} value={`${candidate.source}:${candidate.field}`}>
                      {candidate.label}
                    </option>
                  ))}
                </optgroup>
              ) : null;
            })}
            <optgroup label="Other">
              <option value="constant">Same text on every row</option>
              <option value="blank">Leave blank</option>
            </optgroup>
          </select>
        </div>
        {column.source === "constant" && (
          <div className="field">
            <label htmlFor={`${id}-value`}>Text on every row</label>
            <input id={`${id}-value`} className="input" value={column.value ?? ""} maxLength={200} onChange={(e) => onChange({ value: e.target.value })} />
          </div>
        )}
        {isField(column.source) && (kind === "date" || kind === "month") && (
          <div className="field">
            <label htmlFor={`${id}-date`}>Date written as</label>
            <input
              id={`${id}-date`}
              className="input mono"
              value={column.format.date ?? ""}
              maxLength={20}
              placeholder="DD-MM-YYYY"
              onChange={(e) => format({ date: e.target.value })}
            />
            <span className="muted" style={{ fontSize: 12 }}>
              DD, MM, MMM, YY, YYYY and separators.
            </span>
          </div>
        )}
        {kind === "month" && /DD/.test(column.format.date ?? "") && (
          <div className="field">
            <label htmlFor={`${id}-day`}>Day of the month</label>
            <select id={`${id}-day`} className="input" value={column.format.month_day} onChange={(e) => format({ month_day: e.target.value as "first" | "last" })}>
              <option value="first">The first</option>
              <option value="last">The last</option>
            </select>
          </div>
        )}
        {isField(column.source) && (kind === "money" || kind === "number" || kind === "int") && (
          <div className="field">
            <label htmlFor={`${id}-decimals`}>Decimals</label>
            <select
              id={`${id}-decimals`}
              className="input"
              value={column.format.decimals === null ? "" : String(column.format.decimals)}
              onChange={(e) => format({ decimals: e.target.value === "" ? null : Number(e.target.value) })}
            >
              {DECIMALS.map((value) => (
                <option key={value} value={value}>
                  {value === "" ? "As on the bill" : value}
                </option>
              ))}
            </select>
          </div>
        )}
        {column.source !== "blank" && (
          <div className="field">
            <label htmlFor={`${id}-empty`}>When missing, write</label>
            <input id={`${id}-empty`} className="input" value={column.format.empty} maxLength={20} placeholder="(nothing)" onChange={(e) => format({ empty: e.target.value })} />
          </div>
        )}
      </div>
      {column.source !== "blank" && (
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <label className="check">
            <input type="checkbox" checked={column.format.upper} onChange={(e) => format({ upper: e.target.checked })} /> Upper case
          </label>
          <label className="check">
            <input type="checkbox" checked={column.required} onChange={(e) => onChange({ required: e.target.checked })} /> Required: a line without it stops the
            export
          </label>
        </div>
      )}
    </fieldset>
  );
}
