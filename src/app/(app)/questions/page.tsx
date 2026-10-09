"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Alert, Denied, Time } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { useTitle } from "@/lib/useTitle";

type Question = {
  message_id: string; question: string; reason: string; missing: string; documents: string[]; owner: string;
  conversation_id: string; created_at: string;
};  // prettier-ignore
type Unanswered = { questions: Question[]; by_reason: Record<string, number> };

const REASONS: Record<string, string> = {
  not_in_passages: "The documents do not say",
  no_passages: "Nothing matched in this scope",
  quotes_not_found: "Its quotes were not found",
  figures_not_in_quotes: "Its figures were not in its quotes",
  wording_not_in_passages: "It said what its documents do not",
  held_back: "Passages held back: they read like instructions to an AI",
  model_error: "The model could not answer",
  not_recorded: "Not recorded in this demo",
};

function who(owner: string): string {
  return owner.startsWith("reviewer:") ? "A reviewer" : owner.startsWith("key:") ? "An AI agent" : owner;
}

export default function QuestionsPage() {
  useTitle("Unanswered questions");
  const [data, setData] = useState<Unanswered | null>(null);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [only, setOnly] = useState<string | null>(null);

  useEffect(() => {
    api<Unanswered>("/questions/unanswered").then(setData, (caught: unknown) => {
      if (caught instanceof ApiError && caught.status === 403) setDenied(true);
      else setError(caught instanceof ApiError ? caught.detail : "The questions could not be loaded.");
    });
  }, []);

  if (denied) return <Denied />;
  const total = data ? Object.values(data.by_reason).reduce((sum, n) => sum + n, 0) : 0;
  const shown = (data?.questions ?? []).filter((question) => !only || question.reason === only);

  return (
    <div className="screen">
      <header className="screen-header">
        <div>
          <h1>Unanswered questions</h1>
          <p className="sub">What people asked that the documents could not answer, and why. Often a sign of a document worth adding.</p>
        </div>
      </header>
      <div className="screen-body">
        {error && <Alert kind="fail" title="Not loaded.">{error}</Alert>}
        {data && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span>{total} in the last 30 days:</span>
            {Object.entries(data.by_reason).map(([reason, count]) => (
              <button key={reason} className="chip" aria-pressed={only === reason} onClick={() => setOnly((current) => (current === reason ? null : reason))}>
                <b className="num">{count}</b> {REASONS[reason] ?? reason}
              </button>
            ))}
          </div>
        )}
        {data && !shown.length && <p className="muted">Every question asked was answered from the documents.</p>}
        {shown.length > 0 && (
          <div className="table-wrap">
            <table className="table" style={{ minWidth: 900, fontSize: 13 }}>
              <thead>
                <tr>
                  <th scope="col">Question</th>
                  <th scope="col">Why it was not answered</th>
                  <th scope="col">What was missing</th>
                  <th scope="col">Read</th>
                  <th scope="col">Asked by</th>
                  <th scope="col">When</th>
                  <th scope="col">
                    <span className="sr-only">Conversation</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((question) => (
                  <tr key={question.message_id}>
                    <td style={{ fontWeight: 500 }}>{question.question}</td>
                    <td>{REASONS[question.reason] ?? question.reason}</td>
                    <td>{question.missing || "—"}</td>
                    <td>{question.documents.length ? question.documents.join(", ") : "None"}</td>
                    <td>{who(question.owner)}</td>
                    <td className="num">
                      <Time iso={question.created_at} />
                    </td>
                    <td>
                      <Link className="btn btn-ghost" href={`/chat?c=${question.conversation_id}`}>
                        Conversation
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
