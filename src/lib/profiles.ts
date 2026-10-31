/** Marg import profiles (V2 P3): the layout of the purchase import file a workspace's own Marg
 * accepted, read from one such file. DocForge only offers a source for each column; a person
 * checks every column and saves. Each save is a new version; an export keeps the version it
 * used. The one built-in layout is labelled SAMPLE: it is made up and is no Marg format. */

import { api } from "@/lib/api";
import type { Tasks } from "@/lib/mappings";

export type FieldSource = "invoice" | "line" | "mapping" | "computed";
export type ColumnSource = FieldSource | "constant" | "blank";
export type FieldKind = "text" | "date" | "month" | "money" | "number" | "int";
export type Basis = "sample" | "upload" | "manual";

export type ColumnFormat = {
  date: string | null; month_day: "first" | "last"; decimals: number | null; codes: Record<string, string>; upper: boolean; empty: string;
};  // prettier-ignore

export type Column = {
  header: string; source: ColumnSource; field: string | null; value: string | null; format: ColumnFormat; cell: "text" | "number" | "date";
  required: boolean;
};  // prettier-ignore

export type ProfileSpec = {
  file_type: "csv" | "xlsx"; layout: "per_line" | "per_invoice"; delimiter: "," | ";" | "\t" | "|"; quoting: "minimal" | "all";
  header_row: boolean; line_end: "crlf" | "lf"; encoding: "utf-8" | "utf-8-sig"; sheet_name: string; free_qty: "column" | "row";
  columns: Column[];
};  // prettier-ignore

export type ProfileVersion = { id: string; version_no: number; basis: Basis; sample: boolean; spec: ProfileSpec; created_by: string; created_at: string };

export type MargProfile = {
  id: string; target: "marg"; name: string; active: boolean; latest: ProfileVersion; created_by: string; created_at: string;
  updated_by: string | null; updated_at: string | null;
};  // prettier-ignore

export type Template = { name: string; basis: "sample"; spec: ProfileSpec };
export type FieldDef = { source: FieldSource; field: string; kind: FieldKind; label: string; per_line_only: boolean };
export type SampleColumn = { header: string; examples: string[]; offer: Column | null };
export type Sample = { file_type: "csv" | "xlsx"; delimiter: string; header_row: boolean; encoding: string; sheet_name: string; rows: number; columns: SampleColumn[] };
export type Diff = { row: number; column: string; expected: string; produced: string };
export type CheckResult = {
  version_no: number; bills: number; exact: boolean; rows_expected: number | null; rows_produced: number | null; cells: number | null;
  equal: number | null; diffs: Diff[]; tasks: Tasks | null;
};  // prettier-ignore

/** Shown wherever the SAMPLE layout is in use. */
export const SAMPLE_WARNING = "SAMPLE layout — made up, not a Marg format";

/** What the Exports screen says, word for word, when the workspace has no active Marg profile. */
export const NO_PROFILE_MESSAGE =
  "We need one purchase import file your Marg accepted. Your dealer or your last supplier import will have one. Upload it in Settings > Marg profile and we will match it.";

export const PROFILE_PATH = "/settings/marg-profile";

const BASE = "/settings/export-profiles";

/** The active one first. */
export function listProfiles(): Promise<MargProfile[]> {
  return api<MargProfile[]>(BASE);
}

export function activeProfile(profiles: MargProfile[] | null): MargProfile | null {
  return profiles?.find((profile) => profile.active) ?? null;
}

export function getTemplate(): Promise<Template> {
  return api<Template>(`${BASE}/template`);
}

export function listFields(): Promise<FieldDef[]> {
  return api<FieldDef[]>(`${BASE}/fields`);
}

/** Reads the layout of a file Marg accepted and offers a source per column. Nothing is saved.
 * The browser sets the multipart boundary itself. */
export function readSample(file: File): Promise<Sample> {
  const form = new FormData();
  form.append("file", file);
  return api<Sample>(`${BASE}/read-sample`, { method: "POST", body: form });
}

export function createProfile(name: string, basis: Basis, spec: ProfileSpec): Promise<MargProfile> {
  return api<MargProfile>(BASE, { method: "POST", json: { name, basis, spec } });
}

/** The layout saved as the profile's next version. */
export function saveVersion(id: string, basis: Basis, spec: ProfileSpec, name?: string): Promise<MargProfile> {
  return api<MargProfile>(`${BASE}/${encodeURIComponent(id)}`, { method: "PUT", json: name ? { basis, spec, name } : { basis, spec } });
}

/** Newest first. */
export function listVersions(id: string): Promise<ProfileVersion[]> {
  return api<ProfileVersion[]>(`${BASE}/${encodeURIComponent(id)}/versions`);
}

export function activateProfile(id: string): Promise<MargProfile> {
  return api<MargProfile>(`${BASE}/${encodeURIComponent(id)}/activate`, { method: "POST" });
}

/** Document ids typed or pasted: separated by commas, spaces or new lines. */
export function parseIds(text: string): string[] {
  return text
    .split(/[\s,;]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Makes this profile's file for the approved bills named (in the accepted file's row order)
 * and compares it with the file Marg accepted for them. Nothing is stored. */
export function checkProfile(id: string, file: File, documentIds: string[]): Promise<CheckResult> {
  const form = new FormData();
  form.append("file", file);
  form.append("document_ids", documentIds.join(","));
  return api<CheckResult>(`${BASE}/${encodeURIComponent(id)}/check`, { method: "POST", body: form });
}

export const BASIS_WORDS: Record<Basis, string> = {
  sample: "the SAMPLE layout",
  upload: "a file your Marg accepted",
  manual: "edited by hand",
};

export const SOURCE_GROUPS: { source: FieldSource; label: string }[] = [
  { source: "invoice", label: "From the bill" },
  { source: "line", label: "From the bill line" },
  { source: "mapping", label: "Your Marg names (mappings)" },
  { source: "computed", label: "Worked out from the bill" },
];

/* ---- the editor's draft ---- */

export const EMPTY_FORMAT: ColumnFormat = { date: null, month_day: "first", decimals: null, codes: {}, upper: false, empty: "" };

/** A column being edited: `source` is null until a person chooses one. `offered` is what the
 * file reading offered for it, kept to mark it as a suggestion. */
export type DraftColumn = Omit<Column, "source"> & { source: ColumnSource | null; examples: string[]; offered: Column | null };
export type DraftSettings = Omit<ProfileSpec, "columns">;
export type Draft = { origin: "upload" | "sample" | "version"; title: string; settings: DraftSettings; columns: DraftColumn[] };

export const DEFAULT_SETTINGS: DraftSettings = {
  file_type: "csv", layout: "per_line", delimiter: ",", quoting: "minimal", header_row: true, line_end: "crlf", encoding: "utf-8",
  sheet_name: "Sheet1", free_qty: "column",
};  // prettier-ignore

const DELIMITERS: DraftSettings["delimiter"][] = [",", ";", "\t", "|"];

const withFormat = (column: Column): Column => ({ ...column, format: { ...EMPTY_FORMAT, ...column.format } });

/** A file's layout as read, every column with its offer filled in (marked) or left unset. */
export function draftFromSample(sample: Sample, filename: string): Draft {
  return {
    origin: "upload",
    title: filename,
    settings: {
      ...DEFAULT_SETTINGS,
      file_type: sample.file_type,
      delimiter: DELIMITERS.includes(sample.delimiter as DraftSettings["delimiter"]) ? (sample.delimiter as DraftSettings["delimiter"]) : ",",
      header_row: sample.header_row,
      encoding: sample.encoding === "utf-8-sig" ? "utf-8-sig" : "utf-8",
      sheet_name: sample.sheet_name || "Sheet1",
    },
    columns: sample.columns.map((column) =>
      column.offer
        ? { ...withFormat(column.offer), header: column.header, examples: column.examples, offered: withFormat(column.offer) }
        : { header: column.header, source: null, field: null, value: null, format: EMPTY_FORMAT, cell: "text", required: false, examples: column.examples, offered: null },
    ),
  };
}

/** A saved layout (a version, or the SAMPLE) to edit: every column already chosen. */
export function draftFromSpec(spec: ProfileSpec, origin: "sample" | "version", title: string): Draft {
  const { columns, ...settings } = spec;
  return { origin, title, settings: { ...DEFAULT_SETTINGS, ...settings }, columns: columns.map((column) => ({ ...withFormat(column), examples: [], offered: null })) };
}

/** A sample's file is "upload", the SAMPLE stays "sample" (made up, whatever is changed), an
 * edited version is "manual". */
export function basisOf(draft: Draft): Basis {
  return draft.origin === "sample" ? "sample" : draft.origin === "upload" ? "upload" : "manual";
}

export const sameColumn = (a: Pick<Column, "source" | "field" | "value">, b: Pick<Column, "source" | "field" | "value"> | null) =>
  !!b && a.source === b.source && (a.field ?? null) === (b.field ?? null) && (a.value ?? null) === (b.value ?? null);

/** The layout to save, or the sentence saying what is still to choose. */
export function specFromDraft(draft: Draft): { spec: ProfileSpec } | { error: string; unset: number[] } {
  const unset = draft.columns.flatMap((column, index) => (column.source === null || (isField(column.source) && !column.field) ? [index] : []));
  if (unset.length) {
    const names = unset.map((index) => draft.columns[index].header || `column ${index + 1}`).join(", ");
    const what = unset.length === 1 ? "1 column" : `${unset.length} columns`;
    return { error: `Choose where ${what} ${unset.length === 1 ? "comes" : "come"} from before saving: ${names}. Nothing was saved.`, unset };
  }
  const columns: Column[] = draft.columns.map((column) => {
    const source = column.source as ColumnSource;
    return {
      header: column.header,
      source,
      field: isField(source) ? column.field : null,
      value: source === "constant" ? (column.value ?? "") : null,
      format: { ...column.format, date: column.format.date?.trim() || null },
      cell: column.cell,
      required: column.required,
    };
  });
  return { spec: { ...draft.settings, columns } };
}

export function isField(source: ColumnSource | null): source is FieldSource {
  return source === "invoice" || source === "line" || source === "mapping" || source === "computed";
}

/** The picker's value for a column: "line:batch_no", "constant", "blank", or "" while unset. */
export function pickValue(column: Pick<DraftColumn, "source" | "field">): string {
  if (column.source === null) return "";
  return isField(column.source) ? `${column.source}:${column.field ?? ""}` : column.source;
}

export function fromPick(value: string): Pick<Column, "source" | "field"> | null {
  if (!value) return null;
  if (value === "constant" || value === "blank") return { source: value, field: null };
  const [source, field] = value.split(":");
  return { source: source as FieldSource, field };
}

export function kindOf(fields: FieldDef[], column: Pick<DraftColumn, "source" | "field">): FieldKind {
  if (!isField(column.source)) return "text";
  return fields.find((candidate) => candidate.source === column.source && candidate.field === column.field)?.kind ?? "text";
}

/** "Bill CGST" for invoice.cgst, "Same text on every row" for a constant. */
export function pickLabel(fields: FieldDef[], column: Pick<Column, "source" | "field" | "value">): string {
  if (column.source === "constant") return `Same text on every row: ‘${column.value ?? ""}’`;
  if (column.source === "blank") return "Leave blank";
  return fields.find((candidate) => candidate.source === column.source && candidate.field === column.field)?.label ?? `${column.source}.${column.field}`;
}

/** "240 of 240 cells match." */
export function checkSummary(result: CheckResult): string {
  if (result.cells === null || result.equal === null) return "The bills could not be compared yet: map or correct what is listed, then check again.";
  const cells = `${result.equal.toLocaleString("en-IN")} of ${result.cells.toLocaleString("en-IN")} cells match`;
  const rows =
    result.rows_expected !== null && result.rows_produced !== null && result.rows_expected !== result.rows_produced
      ? `; Marg's file has ${result.rows_expected.toLocaleString("en-IN")} rows, ours ${result.rows_produced.toLocaleString("en-IN")}`
      : "";
  return `${cells}${rows}.`;
}
