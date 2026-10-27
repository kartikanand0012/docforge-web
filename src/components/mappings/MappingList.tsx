"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { ConfirmDialog, Dialog } from "@/components/Dialog";
import { Alert } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { plural } from "@/lib/flags";
import {
  changeMapping, createMapping, listMappings, provenance, removeMapping, type ItemMapping, type Mapping, type MappingKind, type SupplierMapping,
} from "@/lib/mappings";  // prettier-ignore

type Field = { key: string; label: string; identity?: boolean; editable: boolean; hint?: string; mono?: boolean };

const FIELDS: Record<MappingKind, Field[]> = {
  suppliers: [
    { key: "seller_gstin", label: "Seller GSTIN", identity: true, editable: false, mono: true },
    { key: "printed_name", label: "Name printed on bills", identity: true, editable: true },
    { key: "tally_ledger", label: "Tally ledger", editable: true },
    { key: "marg_party", label: "Marg party", editable: true },
    { key: "purchase_ledger", label: "Purchase ledger", editable: true, hint: "Optional." },
    { key: "tax_treatment", label: "Tax treatment", editable: true, hint: "Optional." },
  ],
  items: [
    { key: "product_name", label: "Product name as printed", identity: true, editable: false },
    { key: "pack", label: "Pack", identity: true, editable: false, hint: "As printed, for example 10x10." },
    { key: "printed_hsn", label: "HSN as printed", editable: true, mono: true, hint: "Optional." },
    { key: "tally_item", label: "Tally stock item", editable: true },
    { key: "marg_item", label: "Marg item", editable: true },
    { key: "preferred_hsn", label: "Preferred HSN (4, 6 or 8 digits)", editable: true, mono: true, hint: "Optional. Used in the export instead of the printed HSN." },
  ],
};

const BOOK_FIELDS: Record<MappingKind, [string, string]> = { suppliers: ["tally_ledger", "marg_party"], items: ["tally_item", "marg_item"] };
const NOUN: Record<MappingKind, [string, string]> = { suppliers: ["supplier", "suppliers"], items: ["item", "items"] };

const value = (mapping: Mapping, key: string): string | null => (mapping as unknown as Record<string, string | null>)[key] ?? null;
const titleOf = (mapping: Mapping) => ("printed_name" in mapping ? mapping.printed_name : mapping.product_name);

/** One kind of mapping (suppliers or items): searched, paged, and, for those who review,
 * added, edited and removed. */
export function MappingList({ kind, mayChange }: { kind: MappingKind; mayChange: boolean }) {
  const [one, many] = NOUN[kind];
  const [items, setItems] = useState<Mapping[]>([]);
  const [total, setTotal] = useState(0);
  const [next, setNext] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [loadError, setLoadError] = useState("");
  const [typed, setTyped] = useState("");
  const [query, setQuery] = useState("");
  const [more, setMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Mapping | null>(null);
  const [removing, setRemoving] = useState<Mapping | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [found, setFound] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const loads = useRef(0);
  const searchId = useId();

  useEffect(() => {
    const ticket = ++loads.current;
    listMappings(kind, query).then(
      (page) => {
        if (ticket !== loads.current) return;
        setItems(page.items);
        setTotal(page.total);
        setNext(page.next_after);
        setState("ok");
      },
      (caught: unknown) => {
        if (ticket !== loads.current) return;
        setLoadError(caught instanceof ApiError ? caught.detail : `The ${many} could not be loaded.`);
        setState("error");
      },
    );
  }, [kind, query, many]);

  useEffect(() => {
    if (found) document.getElementById(`mapping-${found}`)?.scrollIntoView?.({ block: "center" });
  }, [found, items]);

  const loadMore = async () => {
    if (!next || more) return;
    const ticket = loads.current;
    setMore(true);
    setMoreError(null);
    try {
      const page = await listMappings(kind, query, next);
      if (ticket !== loads.current) return;
      setItems((current) => [...current, ...page.items.filter((item) => !current.some((shown) => shown.id === item.id))]);
      setTotal(page.total);
      setNext(page.next_after);
    } catch (caught) {
      if (ticket !== loads.current) return;
      setMoreError(caught instanceof ApiError ? caught.detail : `More ${many} could not be loaded. Try again.`);
    } finally {
      setMore(false);
    }
  };

  const search = (event: FormEvent) => {
    event.preventDefault();
    setFound(null);
    if (typed.trim() !== query) setState("loading");
    setQuery(typed.trim());
  };

  /** Shows a mapping already there (from a 409): searched by what identifies it. */
  const show = (id: string, by: string) => {
    setAdding(false);
    setFound(id);
    setTyped(by);
    if (by !== query) setState("loading");
    setQuery(by);
  };

  const remove = async () => {
    if (!removing || removeBusy) return;
    setRemoveBusy(true);
    setRemoveError(null);
    try {
      await removeMapping(kind, removing.id);
      setItems((current) => current.filter((item) => item.id !== removing.id));
      setTotal((current) => Math.max(0, current - 1));
      setMessage(`Removed the mapping for ${titleOf(removing)}.`);
      setRemoving(null);
    } catch (caught) {
      setRemoveError(caught instanceof ApiError ? caught.detail : "The mapping was not removed. Try again.");
    } finally {
      setRemoveBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="filters" style={{ alignItems: "flex-end" }}>
        <form role="search" onSubmit={search} style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <div className="field">
            <label htmlFor={searchId}>Search {many}</label>
            <input
              id={searchId}
              className="input"
              type="search"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={kind === "suppliers" ? "Name, GSTIN or ledger" : "Product, pack or item name"}
              style={{ width: 260 }}
            />
          </div>
          <button type="submit" className="btn btn-secondary">
            Search
          </button>
        </form>
        {state === "ok" && <span className="muted">{`${plural(total, one, many)} mapped`}</span>}
        {mayChange && !adding && (
          <button className="btn btn-primary" style={{ marginLeft: "auto" }} onClick={() => setAdding(true)}>
            Add {one}
          </button>
        )}
      </div>

      <p role="status" className="muted">
        {message}
      </p>

      {adding && (
        <MappingForm
          kind={kind}
          onCancel={() => setAdding(false)}
          onShow={show}
          onSaved={(saved) => {
            setAdding(false);
            setItems((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
            setTotal((current) => current + 1);
            setMessage(`Saved the mapping for ${titleOf(saved)}.`);
          }}
        />
      )}

      {state === "error" && <Alert kind="fail" title={`The ${many} could not be loaded.`}>{loadError}</Alert>}
      {state === "loading" && <p className="muted" aria-busy="true">Loading…</p>}
      {state === "ok" && !items.length && (
        <p className="muted">
          {query
            ? `No ${one} matches “${query}”.`
            : `No ${many} mapped yet. ${kind === "suppliers" ? "Map a supplier" : "Map an item"} here, or when an export asks for it.`}
        </p>
      )}

      {state === "ok" && items.length > 0 && (
        <ul className="mapping-list" aria-label={`Mapped ${many}`}>
          {items.map((mapping) => (
            <MappingRow
              key={mapping.id}
              kind={kind}
              mapping={mapping}
              found={mapping.id === found}
              mayChange={mayChange}
              onEdit={() => setEditing(mapping)}
              onRemove={() => {
                setRemoveError(null);
                setRemoving(mapping);
              }}
            />
          ))}
        </ul>
      )}
      {state === "ok" && items.length > 0 && (
        <div style={{ textAlign: "center" }}>
          {moreError && <Alert kind="warn" title="Not loaded.">{moreError}</Alert>}
          {next ? (
            <button className="btn btn-secondary" onClick={() => void loadMore()} disabled={more}>
              {more ? "Loading…" : "Load more"}
            </button>
          ) : (
            <p className="muted">That is every {one} {query ? "that matches" : "mapped"}.</p>
          )}
        </div>
      )}

      {editing && (
        <EditMapping
          kind={kind}
          mapping={editing}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            setEditing(null);
            setItems((current) => current.map((item) => (item.id === saved.id ? saved : item)));
            setMessage(`Saved the mapping for ${titleOf(saved)}.`);
          }}
        />
      )}
      {removing && (
        <ConfirmDialog
          title={`Remove the mapping for ${titleOf(removing)}?`}
          body={
            <>
              Exports already made do not change. The next export that has this {one} will stop and ask for its name again.
              {removeError && (
                <span role="alert" style={{ display: "block", marginTop: 8 }}>
                  {removeError}
                </span>
              )}
            </>
          }
          action={removeBusy ? "Removing…" : "Remove mapping"}
          busy={removeBusy}
          onConfirm={() => void remove()}
          onClose={() => setRemoving(null)}
        />
      )}
    </div>
  );
}

function MappingRow({
  kind, mapping, found, mayChange, onEdit, onRemove,
}: { kind: MappingKind; mapping: Mapping; found: boolean; mayChange: boolean; onEdit: () => void; onRemove: () => void }) {  // prettier-ignore
  const title = titleOf(mapping);
  const names = FIELDS[kind].filter((field) => !field.identity && field.key !== "printed_hsn" && value(mapping, field.key));
  return (
    <li id={`mapping-${mapping.id}`} className={`mapping-row${found ? " mapping-row-found" : ""}`} aria-current={found ? "true" : undefined}>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
        <p>
          <b style={{ overflowWrap: "anywhere" }}>{title}</b>
          {kind === "suppliers" ? (
            <span className="mono muted"> · {(mapping as SupplierMapping).seller_gstin}</span>
          ) : (
            <span className="muted">
              {(mapping as ItemMapping).pack ? ` · Pack ${(mapping as ItemMapping).pack}` : ""}
              {(mapping as ItemMapping).printed_hsn ? ` · HSN ${(mapping as ItemMapping).printed_hsn} as printed` : ""}
            </span>
          )}
        </p>
        <p style={{ display: "flex", flexWrap: "wrap", columnGap: 14 }}>
          {names.map((field) => (
            <span key={field.key}>
              {field.label.replace(/ \(.*\)$/, "")}: <b>{value(mapping, field.key)}</b>
            </span>
          ))}
        </p>
        <p className="muted" style={{ fontSize: 12 }}>
          {provenance(mapping)}
        </p>
      </div>
      {mayChange && (
        <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
          <button className="btn btn-secondary" onClick={onEdit} aria-label={`Edit ${title}`}>
            Edit
          </button>
          <button className="btn btn-secondary btn-danger" onClick={onRemove} aria-label={`Remove ${title}`}>
            Remove
          </button>
        </div>
      )}
    </li>
  );
}

const needsBooksName = "Give the name in Tally or in Marg, or both.";

/** Add a mapping: its identity as printed on bills, and the names in the workspace's books. */
function MappingForm({
  kind, onCancel, onSaved, onShow,
}: { kind: MappingKind; onCancel: () => void; onSaved: (saved: Mapping) => void; onShow: (id: string, by: string) => void }) {  // prettier-ignore
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [existing, setExisting] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const formId = useId();
  const fields = FIELDS[kind];

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setExisting(null);
    const trimmed = Object.fromEntries(fields.map((field) => [field.key, (values[field.key] ?? "").trim()]));
    if (kind === "suppliers" && !trimmed.seller_gstin) return setError("Enter the seller's GSTIN.");
    if (kind === "suppliers" && !trimmed.printed_name) return setError("Enter the name printed on the supplier's bills.");
    if (kind === "items" && !trimmed.product_name) return setError("Enter the product name as printed on bills.");
    if (BOOK_FIELDS[kind].every((key) => !trimmed[key])) return setError(needsBooksName);
    setBusy(true);
    setError(null);
    const body: Record<string, string> = {};
    for (const field of fields) if (trimmed[field.key]) body[field.key] = trimmed[field.key];
    try {
      onSaved(await createMapping(kind, { ...body, source: "typed" }));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.detail : "The mapping was not saved. Try again.");
      if (caught instanceof ApiError && caught.status === 409 && caught.existingId) setExisting(caught.existingId);
    } finally {
      setBusy(false);
    }
  };

  const identity = kind === "suppliers" ? (values.seller_gstin ?? "").trim() : (values.product_name ?? "").trim();
  return (
    <form className="inline-form" onSubmit={submit} noValidate aria-labelledby={`${formId}-title`} style={{ maxWidth: 640 }}>
      <h3 id={`${formId}-title`} style={{ fontSize: 16 }}>
        Add {NOUN[kind][0]}
      </h3>
      <p className="muted">
        {kind === "suppliers"
          ? "The supplier as printed on its bills, then the name your books use for it. One mapping per GSTIN."
          : "The product as printed on bills (name and pack), then the name your books use for it."}
      </p>
      <FieldInputs fields={fields} values={values} onChange={(key, text) => setValues((current) => ({ ...current, [key]: text }))} idPrefix={formId} />
      {error && (
        <Alert
          kind="fail"
          title="Not saved."
          action={
            existing ? (
              <button type="button" className="btn btn-secondary" onClick={() => onShow(existing, identity)}>
                Show that mapping
              </button>
            ) : undefined
          }
        >
          {error}
        </Alert>
      )}
      <div className="dialog-actions">
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Saving…" : "Save mapping"}
        </button>
      </div>
    </form>
  );
}

function FieldInputs({
  fields, values, onChange, idPrefix,
}: { fields: Field[]; values: Record<string, string>; onChange: (key: string, text: string) => void; idPrefix: string }) {  // prettier-ignore
  return (
    <div className="mapping-fields">
      {fields.map((field) => (
        <div className="field" key={field.key}>
          <label htmlFor={`${idPrefix}-${field.key}`}>{field.label}</label>
          <input
            id={`${idPrefix}-${field.key}`}
            className={`input${field.mono ? " mono" : ""}`}
            value={values[field.key] ?? ""}
            onChange={(e) => onChange(field.key, e.target.value)}
            maxLength={1000}
            aria-describedby={field.hint ? `${idPrefix}-${field.key}-hint` : undefined}
            autoComplete="off"
          />
          {field.hint && (
            <span id={`${idPrefix}-${field.key}-hint`} className="muted" style={{ fontSize: 12 }}>
              {field.hint}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

/** Edit a mapping: only what may change is offered, and only what changed is sent. */
function EditMapping({ kind, mapping, onClose, onSaved }: { kind: MappingKind; mapping: Mapping; onClose: () => void; onSaved: (saved: Mapping) => void }) {
  const editable = FIELDS[kind].filter((field) => field.editable);
  const fixed = FIELDS[kind].filter((field) => !field.editable);
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(editable.map((field) => [field.key, value(mapping, field.key) ?? ""])));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const formId = useId();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const change: Record<string, string | null> = {};
    for (const field of editable) {
      const now = (values[field.key] ?? "").trim() || null;
      if (now !== value(mapping, field.key)) change[field.key] = now;
    }
    const after = (key: string) => (key in change ? change[key] : value(mapping, key));
    if (BOOK_FIELDS[kind].every((key) => !after(key))) return setError(needsBooksName);
    if (kind === "suppliers" && !after("printed_name")) return setError("Enter the name printed on the supplier's bills.");
    if (!Object.keys(change).length) return onClose();
    setBusy(true);
    setError(null);
    try {
      onSaved(await changeMapping(kind, mapping.id, change));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.detail : "The mapping was not saved. Try again.");
      setBusy(false);
    }
  };

  return (
    <Dialog title={`Edit the mapping for ${titleOf(mapping)}`} onClose={onClose} width={560} dismissable={!busy}>
      <form onSubmit={submit} noValidate style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <dl className="account-facts">
          {fixed.map((field) => (
            <div key={field.key}>
              <dt>{field.label}</dt>
              <dd className={field.mono ? "mono" : undefined}>{value(mapping, field.key) ?? "—"}</dd>
            </div>
          ))}
        </dl>
        <FieldInputs fields={editable} values={values} onChange={(key, text) => setValues((current) => ({ ...current, [key]: text }))} idPrefix={formId} />
        <p className="muted" style={{ fontSize: 12 }}>
          Exports already made keep the names they were made with.
        </p>
        {error && (
          <Alert kind="fail" title="Not saved.">
            {error}
          </Alert>
        )}
        <div className="dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
