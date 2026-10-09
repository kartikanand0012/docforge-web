"use client";

import { Upload as UploadIcon } from "lucide-react";
import Link from "next/link";
import { useMemo, useRef, useState, type DragEvent } from "react";
import { Seg, StageProgress, StatusBadge } from "@/components/ui";
import { ApiError, upload } from "@/lib/api";
import { bytes } from "@/lib/format";
import { isFinished } from "@/lib/stages";
import { clientCheck, refusal, type Refusal } from "@/lib/uploads";
import { useLiveStages } from "@/lib/useLiveStages";

type DocType = "invoice" | "purchase_order" | "coa" | "general";
type Row = {
  key: string;
  file: File;
  docType: DocType;
  status: "uploading" | "processing" | "existing" | "refused";
  progress: number;
  documentId?: string;
  stage?: string;
  refusal?: Refusal;
};
type Uploaded = { created: boolean; document: { id: string; stage: string } };

const TYPES: { value: DocType; label: string }[] = [
  { value: "invoice", label: "Invoices" },
  { value: "purchase_order", label: "Orders" },
  { value: "coa", label: "Certificates" },
  { value: "general", label: "General" },
];

export default function UploadPage() {
  const [docType, setDocType] = useState<DocType>("invoice");
  const [rows, setRows] = useState<Row[]>([]);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const change = (key: string, update: Partial<Row>) => setRows((current) => current.map((row) => (row.key === key ? { ...row, ...update } : row)));

  const send = async (row: Row) => {
    change(row.key, { status: "uploading", progress: 0, refusal: undefined });
    const form = new FormData();
    form.append("file", row.file);
    form.append("doc_type", row.docType);
    try {
      const reply = await upload<Uploaded>("/documents", form, (progress) => change(row.key, { progress }));
      change(row.key, {
        status: reply.body.created ? "processing" : "existing",
        documentId: reply.body.document.id,
        stage: reply.body.document.stage,
        progress: 1,
      });
    } catch (caught) {
      const status = caught instanceof ApiError ? caught.status : 0;
      const detail = caught instanceof ApiError ? caught.detail : "The upload failed.";
      change(row.key, {
        status: "refused",
        refusal: status === 0 ? { kind: "warn", word: "Not sent", text: detail, retry: true } : refusal(status, detail, row.file),
      });
    }
  };

  const add = (files: FileList | null) => {
    if (!files?.length) return;
    const added: Row[] = [...files].map((file, index) => ({
      key: `${Date.now()}-${index}-${file.name}`, file, docType, status: "uploading", progress: 0,
    }));  // prettier-ignore
    setRows((current) => [...added, ...current]);
    for (const row of added) {
      const early = clientCheck(row.file);
      if (early) change(row.key, { status: "refused", refusal: { kind: "fail", word: "Refused", text: early } });
      else void send(row);
    }
  };

  const following = useMemo(
    () => rows.filter((row) => row.status === "processing" && row.documentId && !isFinished(row.stage ?? "")).map((row) => row.documentId!),
    [rows],
  );
  const live = useLiveStages(following);
  const stageOf = (row: Row) => (row.documentId && live[row.documentId]?.stage) || row.stage || "stored";

  const ready = rows.filter((row) => row.status === "processing" && isFinished(stageOf(row)) && stageOf(row) !== "failed").length;
  const moving = rows.filter((row) => row.status === "uploading" || (row.status === "processing" && !isFinished(stageOf(row)))).length;
  const needYou = rows.filter((row) => row.status === "refused" || (row.status === "processing" && stageOf(row) === "failed")).length;

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    add(event.dataTransfer.files);
  };

  return (
    <div className="screen">
      <header className="screen-header">
        <div>
          <h1>Upload</h1>
          <p className="sub">PDF, Word, Excel, PowerPoint or images (PNG, JPEG, TIFF). Up to 10 MB and 20 pages each.</p>
        </div>
      </header>
      <div className="screen-body" style={{ maxWidth: 920 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <span>These files are</span>
          <Seg name="upload-type" label="These files are" value={docType} onChange={setDocType} options={TYPES} />
          <span className="muted" style={{ fontSize: 12.5 }}>Choose General for anything that is only to be searched and asked about.</span>
        </div>

        <label
          htmlFor="file-input"
          className={`dropzone${dragging ? " dragging" : ""}`}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <UploadIcon size={28} strokeWidth={1.5} aria-hidden="true" />
          <span style={{ fontSize: 17, fontWeight: 600 }}>Drop files here</span>
          <span className="muted">or choose files. Many at once is fine; each is checked on its own.</span>
          <input
            ref={input}
            id="file-input"
            type="file"
            multiple
            className="sr-only"
            accept=".pdf,.docx,.xlsx,.pptx,.png,.jpg,.jpeg,.tif,.tiff"
            onChange={(event) => {
              add(event.target.files);
              event.target.value = "";
            }}
          />
        </label>

        {rows.length > 0 && (
          <section aria-labelledby="session-title" aria-live="polite">
            <h2 id="session-title" style={{ fontSize: 18 }}>
              This session
            </h2>
            <p className="muted" style={{ marginBottom: 8 }}>
              {ready} ready · {moving} in progress · {needYou} need you
            </p>
            <ul className="upload-list">
              {rows.map((row) => {
                const stage = stageOf(row);
                return (
                  <li key={row.key} className="upload-row">
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontWeight: 500, overflowWrap: "anywhere" }}>{row.file.name}</p>
                      <p className="muted" style={{ fontSize: 12 }}>
                        {bytes(row.file.size)} · {TYPES.find((t) => t.value === row.docType)?.label}
                      </p>
                      {row.status === "uploading" && (
                        <div className="progress" role="progressbar" aria-label={`Uploading ${row.file.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(row.progress * 100)}>
                          <span style={{ width: `${row.progress * 100}%` }} />
                        </div>
                      )}
                      {row.status === "processing" && !isFinished(stage) && <StageProgress stage={stage} />}
                      {row.status === "processing" && isFinished(stage) && stage !== "failed" && (
                        <p style={{ fontSize: 13 }}>{row.docType === "general" ? "Read and searchable." : "Read and checked. Values are ready to review."}</p>
                      )}
                      {row.status === "processing" && stage === "failed" && <p style={{ fontSize: 13, color: "var(--st-fail-fg)" }}>It could not be read. Open it to see why.</p>}
                      {row.status === "existing" && <p style={{ fontSize: 13 }}>This exact file is already in DocForge. Nothing new was stored.</p>}
                      {row.status === "refused" && row.refusal && (
                        <p style={{ fontSize: 13, color: `var(--st-${row.refusal.kind}-fg)` }}>{row.refusal.text}</p>
                      )}
                    </div>
                    <div className="upload-actions">
                      {row.status === "uploading" && <StatusBadge kind="info">Uploading</StatusBadge>}
                      {row.status === "processing" && !isFinished(stage) && <StatusBadge kind="info">Processing</StatusBadge>}
                      {row.status === "processing" && isFinished(stage) && (
                        <>
                          <StatusBadge kind={stage === "failed" ? "fail" : "ok"}>{stage === "failed" ? "Failed" : "Ready"}</StatusBadge>
                          <Link className="btn btn-secondary" href={`/documents/${row.documentId}`}>
                            Open
                          </Link>
                        </>
                      )}
                      {row.status === "existing" && (
                        <>
                          <StatusBadge kind="neutral">Already here</StatusBadge>
                          <Link className="btn btn-secondary" href={`/documents/${row.documentId}`}>
                            Open existing
                          </Link>
                        </>
                      )}
                      {row.status === "refused" && row.refusal && (
                        <>
                          <StatusBadge kind={row.refusal.kind}>{row.refusal.word}</StatusBadge>
                          {row.refusal.retry && (
                            <button className="btn btn-secondary" onClick={() => void send(row)}>
                              Try again
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
