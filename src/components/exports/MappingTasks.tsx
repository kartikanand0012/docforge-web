"use client";

import Link from "next/link";
import { useEffect, useId, useState, type FormEvent } from "react";
import { Alert, StatusBadge } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { plural } from "@/lib/flags";
import { BOOKS_NAME, NAME_LABEL, confirmRequest, nameField, runSuggestions, type Books, type Problem, type Suggestion, type TaskRef, type Tasks } from "@/lib/mappings";

const keyOf = (ref: TaskRef) => (ref.kind === "supplier" ? `s:${ref.task.seller_gstin}` : `i:${ref.task.item_key}`);

type Bill = { document_id: string; filename: string; problems: Problem[] };

/** Problems by bill, in the order listed: a Marg import's checks name each line. */
export function problemsByBill(problems: Problem[]): Bill[] {
  const bills = new Map<string, Bill>();
  for (const problem of problems) {
    const bill = bills.get(problem.document_id) ?? { document_id: problem.document_id, filename: problem.filename, problems: [] };
    bill.problems.push(problem);
    bills.set(problem.document_id, bill);
  }
  return [...bills.values()];
}

/** What a run (or a profile check) that stopped needs: each supplier and item to map, with
 * names to offer, and the bills - and lines - to correct. A suggestion only fills the name;
 * Confirm mapping saves it. Suggestions are asked for when there is a run to ask about. */
export function MappingTasks({
  tasks: listed, books, runId = null, mayMap, onRunAgain, again = false, againLabel = "Run export again",
}: { tasks: Tasks; books: Books; runId?: string | null; mayMap: boolean; onRunAgain?: () => void; again?: boolean; againLabel?: string }) {  // prettier-ignore
  const [tasks, setTasks] = useState<Tasks>(listed);
  const [suggesting, setSuggesting] = useState(runId !== null);
  const [done, setDone] = useState<Record<string, string>>({});

  useEffect(() => {
    if (runId === null) return;
    let live = true;
    runSuggestions(runId)
      .then((found) => live && setTasks(found))
      .catch(() => undefined) // the list without suggestions still stands
      .finally(() => live && setSuggesting(false));
    return () => {
      live = false;
    };
  }, [runId]);

  // Tasks mapped since the run are left out of the suggestions' list, so the run's own list
  // is the one to finish.
  const all: TaskRef[] = [
    ...listed.suppliers.map((task) => ({ kind: "supplier" as const, task })),
    ...listed.items.map((task) => ({ kind: "item" as const, task })),
  ];
  const withSuggestions = (ref: TaskRef): TaskRef =>
    ref.kind === "supplier"
      ? { kind: "supplier", task: tasks.suppliers.find((task) => task.seller_gstin === ref.task.seller_gstin) ?? ref.task }
      : { kind: "item", task: tasks.items.find((task) => task.item_key === ref.task.item_key) ?? ref.task };
  const mappedSince = (ref: TaskRef) =>
    runId !== null &&
    !suggesting &&
    (ref.kind === "supplier" ? !tasks.suppliers.some((t) => t.seller_gstin === ref.task.seller_gstin) : !tasks.items.some((t) => t.item_key === ref.task.item_key));
  const finished = all.every((ref) => keyOf(ref) in done || mappedSince(ref));
  const bills = problemsByBill(listed.problems);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {!mayMap && all.length > 0 && <p className="muted">Someone who reviews bills can map these; you can see what is missing.</p>}
      {all.length > 0 && (
        <ul className="task-list" aria-busy={suggesting}>
          {all.map((ref) => (
            <li key={keyOf(ref)}>
              <TaskCard
                taskRef={withSuggestions(ref)}
                books={books}
                mayMap={mayMap}
                done={done[keyOf(ref)] ?? null}
                mappedSince={mappedSince(ref)}
                onDone={(name) => setDone((current) => ({ ...current, [keyOf(ref)]: name }))}
              />
            </li>
          ))}
        </ul>
      )}
      {bills.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <h3 style={{ fontSize: 15 }}>{plural(bills.length, "bill", "bills")} to correct first</h3>
          <ul className="task-problems">
            {bills.map((bill) => (
              <li key={bill.document_id}>
                <Link href={`/documents/${bill.document_id}`} style={{ fontWeight: 500, overflowWrap: "anywhere" }}>
                  {bill.filename}
                </Link>{" "}
                {bill.problems.length === 1 && !bill.problems[0].line ? (
                  <span>{bill.problems[0].problem}</span>
                ) : (
                  <ul className="task-lines" aria-label={`What to correct on ${bill.filename}`}>
                    {bill.problems.map((problem, index) => (
                      <li key={`${problem.line ?? "bill"}-${index}`}>
                        {problem.line ? <b className="num">Line {problem.line}:</b> : <b>The bill:</b>} <span>{problem.problem}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {finished && onRunAgain && (
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button className="btn btn-primary" onClick={onRunAgain} disabled={again}>
            {again ? "Running…" : againLabel}
          </button>
          <span className="muted">
            {all.length ? "Everything above is mapped." : ""} {bills.length ? "Correct the bills listed first, or it stops again." : ""}
          </span>
        </div>
      )}
    </div>
  );
}

function TaskCard({
  taskRef, books, mayMap, done, mappedSince, onDone,
}: { taskRef: TaskRef; books: Books; mayMap: boolean; done: string | null; mappedSince: boolean; onDone: (name: string) => void }) {  // prettier-ignore
  const [name, setName] = useState("");
  const [clicked, setClicked] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const id = useId();
  const field = nameField(taskRef.kind, books);
  const label = NAME_LABEL[field];
  const { task } = taskRef;
  const title = taskRef.kind === "supplier" ? taskRef.task.printed_names.join(" / ") || taskRef.task.seller_gstin : taskRef.task.product_name;

  const confirm = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (!name.trim()) return setError("Type the name your books use, or choose a suggestion.");
    const request = confirmRequest(taskRef, books, name, clicked);
    setBusy(true);
    setError(null);
    try {
      await api(request.path, { method: request.method, json: request.json });
      onDone(name.trim());
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.detail : "The mapping was not saved. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const use = (suggestion: Suggestion) => {
    setName(suggestion.name);
    setClicked(suggestion.name);
    setError(null);
  };

  return (
    <form className="task-card" onSubmit={confirm} noValidate>
      <fieldset style={{ border: 0, padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
        <legend style={{ fontWeight: 600, overflowWrap: "anywhere" }}>{title}</legend>
        <p className="muted">
          {taskRef.kind === "supplier" ? (
            <span className="mono">{taskRef.task.seller_gstin}</span>
          ) : (
            [taskRef.task.pack ? `Pack ${taskRef.task.pack}` : "No pack printed", taskRef.task.printed_hsn ? `HSN ${taskRef.task.printed_hsn} as printed` : ""]
              .filter(Boolean)
              .join(" · ")
          )}{" "}
          · on {plural(task.bills, "bill", "bills")}
          {task.mapping_id ? ` · mapped already, but without a ${BOOKS_NAME[books]} name` : ""}
        </p>
        {done !== null || mappedSince ? (
          <p>
            <StatusBadge kind="ok">Done</StatusBadge> {done !== null ? `Mapped to ‘${done}’.` : "Mapped since this export ran."}
          </p>
        ) : (
          <>
            {task.suggestions.length > 0 &&
              (mayMap ? (
                <div className="task-suggestions" role="group" aria-label="Suggested names">
                  {task.suggestions.map((suggestion) => (
                    <button
                      key={`${suggestion.name}-${suggestion.why}`}
                      type="button"
                      className="chip"
                      aria-pressed={clicked === suggestion.name && name === suggestion.name}
                      onClick={() => use(suggestion)}
                    >
                      Use ‘{suggestion.name}’ – {suggestion.why}
                    </button>
                  ))}
                </div>
              ) : (
                <p>
                  Suggested:{" "}
                  {task.suggestions.map((suggestion, index) => (
                    <span key={`${suggestion.name}-${suggestion.why}`}>
                      {index ? "; " : ""}‘{suggestion.name}’ ({suggestion.why})
                    </span>
                  ))}
                </p>
              ))}
            {mayMap && (
              <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
                <div className="field" style={{ flex: "1 1 240px" }}>
                  <label htmlFor={`${id}-name`}>{label}</label>
                  <input
                    id={`${id}-name`}
                    className="input"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      setError(null);
                    }}
                    maxLength={1000}
                    autoComplete="off"
                    aria-invalid={error ? true : undefined}
                  />
                </div>
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  {busy ? "Saving…" : "Confirm mapping"}
                </button>
              </div>
            )}
            {error && (
              <Alert kind="fail" title="Not saved.">
                {error}
              </Alert>
            )}
          </>
        )}
      </fieldset>
    </form>
  );
}
