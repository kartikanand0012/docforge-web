"use client";

import { Upload as UploadIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { useViewing } from "@/components/Shell";
import { Alert, Seg, StageProgress, StatusBadge } from "@/components/ui";
import { ApiError, upload } from "@/lib/api";
import { SENT_AT_ONCE, TOO_MANY, batchPath, createBatch, planDrop, pool, sendFile, sendZip } from "@/lib/batches";
import { bytes } from "@/lib/format";
import { isFinished } from "@/lib/stages";
import { clientCheck, refusal, type Refusal } from "@/lib/uploads";
import { useLiveStages } from "@/lib/useLiveStages";
import { useTitle } from "@/lib/useTitle";

type DocType = "invoice" | "purchase_order" | "coa" | "general";
type Row = {
  key: string;
  file: File;
  docType: DocType;
  status: "uploading" | "processing" | "existing" | "refused" | "batch";
  batchId?: string;
  summary?: string;
  progress: number;
  documentId?: string;
  stage?: string;
  refusal?: Refusal;
};
type Uploaded = { created: boolean; document: { id: string; stage: string } };

const TYPES: { value: DocType; label: string }[] = [
  { value: "invoice", label: "GST invoices" },
  { value: "purchase_order", label: "Purchase orders" },
  { value: "coa", label: "Certificates of analysis" },
  { value: "general", label: "Anything else" },
];

export default function UploadPage() {
  useTitle("Upload");
  const viewing = useViewing();
  const [docType, setDocType] = useState<DocType>("invoice");
  const [rows, setRows] = useState<Row[]>([]);
  const [dragging, setDragging] = useState(false);
  const [batches, setBatches] = useState<{ id: string; label: string }[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
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

  /** A ZIP, sent whole: the server unpacks it and makes one document per file in it. */
  const sendZipRow = async (row: Row) => {
    change(row.key, { status: "uploading", progress: 0, refusal: undefined });
    try {
      const reply = await sendZip(row.file, row.docType, (progress) => change(row.key, { progress }));
      const counts = reply.body.counts;
      change(row.key, {
        status: "batch", batchId: reply.body.id, progress: 1,
        summary: `${counts.total} files: ${counts.received} new, ${counts.already_received} already here, ${counts.refused} refused.`,
      });  // prettier-ignore
      setBatches((current) => [{ id: reply.body.id, label: row.file.name }, ...current]);
    } catch (caught) {
      const detail = caught instanceof ApiError ? caught.detail : "The upload failed.";
      change(row.key, { status: "refused", refusal: { kind: "fail", word: "Refused", text: detail, retry: !(caught instanceof ApiError) || caught.status === 0 } });
    }
  };

  /** Files dropped together: one batch, each file sent on its own into it, a few at a time. */
  const sendBatch = async (batchRows: Row[]) => {
    let batchId: string;
    try {
      batchId = (await createBatch(batchRows.length, docType)).id;
    } catch (caught) {
      const detail = caught instanceof ApiError ? caught.detail : "The batch could not be started.";
      for (const row of batchRows) change(row.key, { status: "refused", refusal: { kind: "warn", word: "Not sent", text: detail } });
      return;
    }
    setBatches((current) => [{ id: batchId, label: `${batchRows.length} files` }, ...current]);
    await pool(batchRows, SENT_AT_ONCE, async (row) => {
      try {
        const reply = await sendFile(batchId, row.file, (progress) => change(row.key, { progress }));
        const item = reply.body;
        if (item.outcome === "refused") change(row.key, { status: "refused", batchId, refusal: { kind: "fail", word: "Refused", text: item.reason ?? "Not accepted." } });
        else change(row.key, { status: item.outcome === "received" ? "processing" : "existing", batchId, documentId: item.document_id ?? undefined, stage: "stored", progress: 1 });
      } catch (caught) {
        const detail = caught instanceof ApiError ? caught.detail : "The upload failed.";
        change(row.key, { status: "refused", batchId, refusal: { kind: "warn", word: "Not sent", text: detail } });
      }
    });
  };

  const add = (files: FileList | null) => {
    if (!files?.length) return;
    const plan = planDrop([...files]);
    if (plan.tooMany) {
      setNotice(TOO_MANY);
      return;
    }
    setNotice(null);
    const stamp = Date.now();
    const row = (file: File, index: number): Row => ({ key: `${stamp}-${index}-${file.name}`, file, docType, status: "uploading", progress: 0 });
    const zipRows = plan.zips.map((file, index) => row(file, index));
    const fileRows = plan.files.map((file, index) => row(file, plan.zips.length + index));
    setRows((current) => [...zipRows, ...fileRows, ...current]);
    for (const zip of zipRows) void sendZipRow(zip);
    const ok: Row[] = [];
    for (const each of fileRows) {
      const early = clientCheck(each.file);
      if (early) change(each.key, { status: "refused", refusal: { kind: "fail", word: "Refused", text: early } });
      else ok.push(each);
    }
    if (ok.length === 1) void send(ok[0]);
    else if (ok.length > 1) void sendBatch(ok);
  };

  // Files still being sent are lost if the page closes; what has arrived carries on.
  const sending = rows.some((each) => each.status === "uploading");
  useEffect(() => {
    if (!sending) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [sending]);

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
          <p className="sub">
            PDF, Word, Excel, PowerPoint or images (PNG, JPEG, TIFF), up to 10 MB each; up to 50 files at once, or a ZIP of up to 200. A PDF holding
            several invoices is divided into one document per invoice.
          </p>
        </div>
      </header>
      <div className="screen-body" style={{ maxWidth: 920 }}>
        {viewing ? (
          // A viewed workspace is read only: nothing can be uploaded into it.
          <Alert kind="info" title="Uploading is off while you view someone's workspace.">
            Go back to the dashboard to upload to your own.
          </Alert>
        ) : (
          <>
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <span>These files are</span>
              <Seg name="upload-type" label="These files are" value={docType} onChange={setDocType} options={TYPES} />
              <span className="muted" style={{ fontSize: 12.5, flexBasis: "100%" }}>
                Invoices, orders and certificates are checked field by field (totals, GSTINs, batches). Receipts, payslips, statements, contracts and
                everything else: choose <b>Anything else</b>. They are read, searchable, and you can ask questions about them.
              </span>
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
              <span className="muted">or choose files. Up to 50 at once, or one ZIP of a whole folder; each file is checked on its own.</span>
              <input
                ref={input}
                id="file-input"
                type="file"
                multiple
                className="sr-only"
                accept=".pdf,.docx,.xlsx,.pptx,.png,.jpg,.jpeg,.tif,.tiff,.zip"
                onChange={(event) => {
                  add(event.target.files);
                  event.target.value = "";
                }}
              />
            </label>
          </>
        )}

        {notice && (
          <Alert kind="warn" title="Too many files at once">
            {notice}
          </Alert>
        )}

        {batches.length > 0 && (
          <p role="status" style={{ fontSize: 13.5 }}>
            {batches.map((batch, index) => (
              <span key={batch.id}>
                {index > 0 && " · "}
                <Link href={batchPath(batch.id)}>Batch view: {batch.label}</Link>
              </span>
            ))}
            <span className="muted"> — you can leave once every file is sent; reading carries on.</span>
          </p>
        )}

        {rows.length > 0 && (
          <section aria-labelledby="session-title">
            <h2 id="session-title" style={{ fontSize: 18 }}>
              This session
            </h2>
            <p className="muted" style={{ marginBottom: 8 }} role="status" aria-live="polite">
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
                      {row.status === "batch" && <p style={{ fontSize: 13 }}>{row.summary}</p>}
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
                      {row.status === "batch" && row.batchId && (
                        <>
                          <StatusBadge kind="ok">Unpacked</StatusBadge>
                          <Link className="btn btn-secondary" href={batchPath(row.batchId)}>
                            Open batch
                          </Link>
                        </>
                      )}
                      {row.status === "refused" && row.refusal && (
                        <>
                          <StatusBadge kind={row.refusal.kind}>{row.refusal.word}</StatusBadge>
                          {row.refusal.retry && !row.batchId && (
                            <button className="btn btn-secondary" onClick={() => void (planDrop([row.file]).zips.length ? sendZipRow(row) : send(row))}>
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
