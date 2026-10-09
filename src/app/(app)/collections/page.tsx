"use client";

import { Book, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ConfirmDialog, Dialog } from "@/components/Dialog";
import { useToast } from "@/components/Toast";
import { Alert, DocTypeTag, EmptyPanel, StatusBadge, Time } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { stageKind, stageWord } from "@/lib/stages";
import { useTitle } from "@/lib/useTitle";

type Collection = { id: string; name: string; description: string; documents: number; created_by: string; created_at: string };
type Member = { id: string; filename: string; doc_type: string; stage: string; added_at: string };
type DocumentItem = { id: string; filename: string; doc_type: string };

export default function CollectionsPage() {
  useTitle("Knowledge bases");
  const router = useRouter();
  const toast = useToast();
  const [collections, setCollections] = useState<Collection[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [making, setMaking] = useState(false);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(
    () =>
      api<Collection[]>("/collections").then(
        (found) => {
          setCollections(found);
          setSelected((current) => (current && found.some((c) => c.id === current) ? current : (found[0]?.id ?? null)));
        },
        (caught: unknown) => setError(caught instanceof ApiError ? caught.detail : "Knowledge bases could not be loaded."),
      ),
    [],
  );
  useEffect(() => {
    void reload();
  }, [reload]);

  const loadMembers = useCallback(
    (id: string) => api<Member[]>(`/collections/${id}/documents`).then(setMembers, () => setMembers([])),
    [],
  );
  useEffect(() => {
    if (selected) void loadMembers(selected);
  }, [selected, loadMembers]);

  const current = collections?.find((collection) => collection.id === selected) ?? null;

  const remove = async (member: Member) => {
    if (!current) return;
    try {
      await api(`/collections/${current.id}/documents/${member.id}`, { method: "DELETE" });
      toast(`${member.filename} removed from ${current.name}. It stays in DocForge.`);
    } catch (caught) {
      setError(caught instanceof ApiError ? `Not removed: ${caught.detail}` : "It was not removed. Try again.");
    }
    void loadMembers(current.id);
    void reload();
  };

  return (
    <div className="screen">
      <header className="screen-header">
        <div>
          <h1>Knowledge bases</h1>
          <p className="sub">Group documents so questions are answered from that group only.</p>
        </div>
        <button className="btn btn-secondary" onClick={() => setMaking(true)}>
          <Plus size={14} strokeWidth={1.5} aria-hidden="true" /> New knowledge base
        </button>
      </header>
      <div className="screen-body">
        {error && <Alert kind="fail" title="Not loaded.">{error}</Alert>}
        {making && (
          <NewCollection
            onCancel={() => setMaking(false)}
            onMade={(made) => {
              setMaking(false);
              setSelected(made.id);
              void reload();
              toast(`${made.name} made. Add documents to it.`);
            }}
          />
        )}
        {collections && !collections.length && !making && (
          <EmptyPanel
            icon={Book}
            title="No knowledge bases yet"
            text="Make one to ask questions of a group of documents only, such as one supplier's contracts."
            action={
              <button className="btn btn-secondary" onClick={() => setMaking(true)}>
                New knowledge base
              </button>
            }
          />
        )}
        {collections && collections.length > 0 && (
          <div className="kb-layout">
            <ul className="kb-list" aria-label="Knowledge bases">
              {collections.map((collection) => (
                <li key={collection.id}>
                  <button className="kb-card" aria-current={collection.id === selected ? "true" : undefined} onClick={() => setSelected(collection.id)}>
                    <span style={{ fontSize: 15, fontWeight: 600 }}>{collection.name}</span>
                    {collection.description && <span className="muted" style={{ fontSize: 13 }}>{collection.description}</span>}
                    <span className="muted num" style={{ fontSize: 12 }}>
                      {collection.documents} document{collection.documents === 1 ? "" : "s"} · made <Time iso={collection.created_at} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {current && (
              <section className="kb-detail" aria-labelledby="kb-title">
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
                  <div>
                    <h2 id="kb-title" style={{ fontSize: 22 }}>
                      {current.name}
                    </h2>
                    {current.description && <p className="muted">{current.description}</p>}
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn btn-secondary" onClick={() => setAdding(true)}>
                      Add documents
                    </button>
                    <button className="btn btn-ghost btn-danger" onClick={() => setDeleting(true)}>
                      Delete
                    </button>
                  </div>
                </div>
                <div className="kb-ask">
                  <span>Ask within this knowledge base</span>
                  <button className="btn btn-primary" onClick={() => router.push(`/chat?collection=${current.id}`)}>
                    Ask
                  </button>
                </div>
                {members.length ? (
                  <div className="table-wrap">
                    <table className="table" style={{ minWidth: 560 }}>
                      <thead>
                        <tr>
                          <th scope="col">Document</th>
                          <th scope="col">Type</th>
                          <th scope="col">Where it is</th>
                          <th scope="col">Added</th>
                          <th scope="col">
                            <span className="sr-only">Remove</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {members.map((member) => (
                          <tr key={member.id}>
                            <td>
                              <Link href={`/documents/${member.id}`}>{member.filename}</Link>
                            </td>
                            <td>
                              <DocTypeTag docType={member.doc_type} />
                            </td>
                            <td>
                              <StatusBadge kind={stageKind(member.stage)}>{stageWord(member.stage)}</StatusBadge>
                            </td>
                            <td className="num">
                              <Time iso={member.added_at} />
                            </td>
                            <td className="right">
                              <button className="btn btn-ghost btn-danger" aria-label={`Remove ${member.filename} from ${current.name}`} onClick={() => void remove(member)}>
                                Remove
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="muted">No documents in it yet.</p>
                )}
                <p className="muted" style={{ fontSize: 12.5 }}>
                  Removing a document here keeps it in DocForge.
                </p>
              </section>
            )}
          </div>
        )}
      </div>

      {adding && current && (
        <AddDocuments
          collection={current}
          already={members.map((member) => member.id).join(",")}
          onClose={() => setAdding(false)}
          onAdded={(count) => {
            setAdding(false);
            toast(`${count} document${count === 1 ? "" : "s"} added to ${current.name}.`);
            void loadMembers(current.id);
            void reload();
          }}
        />
      )}
      {deleting && current && (
        <ConfirmDialog
          title={`Delete ${current.name}?`}
          body={`The knowledge base goes; its ${current.documents} document${current.documents === 1 ? "" : "s"} stay in DocForge. Conversations asked within it can no longer take follow-ups.`}
          action="Delete knowledge base"
          onClose={() => setDeleting(false)}
          onConfirm={async () => {
            try {
              await api(`/collections/${current.id}`, { method: "DELETE" });
              toast(`${current.name} deleted. Its documents stay in DocForge.`);
              setSelected(null);
            } catch (caught) {
              setError(caught instanceof ApiError ? `Not deleted: ${caught.detail}` : "It was not deleted. Try again.");
            } finally {
              setDeleting(false);
              void reload();
            }
          }}
        />
      )}
    </div>
  );
}

function NewCollection({ onCancel, onMade }: { onCancel: () => void; onMade: (made: Collection) => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return setError("Give it a name.");
    try {
      onMade(await api<Collection>("/collections", { method: "POST", json: { name: name.trim(), description: description.trim() } }));
    } catch (caught) {
      setError(
        caught instanceof ApiError && caught.status === 409
          ? `A knowledge base called “${name.trim()}” already exists. Names are unique, whatever their case.`
          : caught instanceof ApiError
            ? caught.detail
            : "It could not be made.",
      );
    }
  };
  return (
    <form className="inline-form" onSubmit={submit} noValidate aria-label="New knowledge base">
      <div className="field">
        <label htmlFor="kb-name">Name</label>
        <input id="kb-name" className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </div>
      <div className="field">
        <label htmlFor="kb-description">What it holds</label>
        <input id="kb-description" className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      {error && (
        <p role="alert" className="reason-box reason-fail" style={{ fontSize: 13 }}>
          {error}
        </p>
      )}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary">
          Make it
        </button>
      </div>
    </form>
  );
}

function AddDocuments({
  collection, already, onClose, onAdded,
}: { collection: Collection; already: string; onClose: () => void; onAdded: (count: number) => void }) {  // prettier-ignore
  const [documents, setDocuments] = useState<DocumentItem[] | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<{ items: DocumentItem[] }>("/documents?limit=500").then(
      (page) => {
        const present = new Set(already.split(","));
        setDocuments(page.items.filter((item) => !present.has(item.id)));
      },
      () => setDocuments([]),
    );
  }, [already]);
  const shown = (documents ?? []).filter((item) => item.filename.toLowerCase().includes(filter.toLowerCase()));
  const add = async () => {
    try {
      await api(`/collections/${collection.id}/documents`, { method: "POST", json: { document_ids: [...chosen] } });
      onAdded(chosen.size);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.detail : "They could not be added.");
    }
  };
  return (
    <Dialog
      title={`Add documents to ${collection.name}`}
      onClose={onClose}
      width={560}
      actions={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={!chosen.size} onClick={() => void add()}>
            Add {chosen.size || ""}
          </button>
        </>
      }
    >
      <label className="sr-only" htmlFor="kb-filter">
        Filter documents
      </label>
      <input id="kb-filter" className="input" placeholder="Filter by name" value={filter} onChange={(e) => setFilter(e.target.value)} autoFocus />
      {error && <p role="alert" className="reason-box reason-fail">{error}</p>}
      <ul className="pick-list">
        {documents === null && <li className="muted">Loading…</li>}
        {documents && !shown.length && <li className="muted">No other documents to add.</li>}
        {shown.map((item) => (
          <li key={item.id}>
            <label className="check">
              <input
                type="checkbox"
                checked={chosen.has(item.id)}
                onChange={(e) =>
                  setChosen((current) => {
                    const next = new Set(current);
                    if (e.target.checked) next.add(item.id);
                    else next.delete(item.id);
                    return next;
                  })
                }
              />
              {item.filename} <DocTypeTag docType={item.doc_type} />
            </label>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
