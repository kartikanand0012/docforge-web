"use client";

import { Check, Minus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Alert, Marks, StatusBadge } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { answerBadge, answerNote, openQuote, sendsOnEnter, type Answer, type Citation } from "@/lib/chat";
import { localTime } from "@/lib/format";
import { stream } from "@/lib/sse";

export type Turn = { id: string; question: string; asked: string; answer: Answer | null; error: string | null };
type Stage = { stage: string; passages?: number };

const STAGES = ["searching", "reading", "checking"] as const;
const STAGE_WORDS: Record<string, (stage: Stage | null) => string> = {
  searching: () => "Searching",
  reading: (stage) => (stage?.passages !== undefined ? `Reading ${stage.passages} passages` : "Reading"),
  checking: () => "Checking quotes",
};

type Props = {
  turns: Turn[];
  onTurns: (update: (turns: Turn[]) => Turn[]) => void;
  conversationId: string | null;
  onConversation: (id: string) => void;
  scope: { documentId?: string; collectionId?: string };
  /** A quote shown in place (the document's Ask tab) instead of opening its page. */
  onQuote?: (citation: Citation, n: number) => void;
  compact?: boolean;
};

const BADGE_ICONS = { ok: Check, neutral: Minus, fail: X, warn: undefined };

export function ChatThread({ turns, onTurns, conversationId, onConversation, scope, onQuote, compact = false }: Props) {
  const router = useRouter();
  const [question, setQuestion] = useState("");
  const [stage, setStage] = useState<Stage | null>(null);
  const [announce, setAnnounce] = useState("");
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const newest = useRef<HTMLDivElement>(null);
  const streaming = stage !== null;

  useEffect(() => () => controller.current?.abort(), []);

  const quote = (citation: Citation, n: number) => {
    if (onQuote) return onQuote(citation, n);
    router.push(openQuote(citation, n, `quote ${n} from chat`));
  };

  const ask = async (event?: FormEvent) => {
    event?.preventDefault();
    const text = question.trim();
    if (!text || streaming) return;
    setError(null);
    setQuestion("");
    const id = `turn-${Date.now()}`;
    onTurns((current) => [...current, { id, question: text, asked: new Date().toISOString(), answer: null, error: null }]);
    const abort = new AbortController();
    controller.current = abort;
    setStage({ stage: "searching" });
    setAnnounce("Searching");
    const body: Record<string, unknown> = { question: text };
    if (conversationId) body.conversation_id = conversationId;
    else if (scope.documentId) body.document_id = scope.documentId;
    else if (scope.collectionId) body.collection_id = scope.collectionId;
    let ended = false;
    try {
      for await (const message of stream("/chat/stream", { method: "POST", json: body, signal: abort.signal })) {
        if (message.name === "stage") {
          const next = message.data as Stage;
          setStage(next);
          setAnnounce(STAGE_WORDS[next.stage]?.(next) ?? next.stage);
        } else if (message.name === "answer") {
          const answer = message.data as unknown as Answer;
          onTurns((current) => current.map((turn) => (turn.id === id ? { ...turn, answer } : turn)));
          ended = true;
          if (!conversationId) onConversation(answer.conversation_id);
          setAnnounce(`Answer ready: ${answerBadge(answer).word}`);
          // Focus moves to the answer only if the person is not already typing the next question.
          requestAnimationFrame(() => {
            const active = document.activeElement;
            if (!active || active === document.body || active.closest("form.composer button")) newest.current?.focus();
          });
        } else if (message.name === "error") {
          ended = true;
          const detail = String((message.data as { detail?: string }).detail ?? "The question could not be answered.");
          onTurns((current) => current.map((turn) => (turn.id === id ? { ...turn, error: detail } : turn)));
        }
      }
      if (!ended && !abort.signal.aborted) {
        // The connection closed without an answer: say so rather than leave the question bare.
        onTurns((current) =>
          current.map((turn) => (turn.id === id ? { ...turn, error: "The answer was cut off. It may be kept in this conversation; try again." } : turn)),
        );
      }
    } catch (caught) {
      if (abort.signal.aborted) {
        onTurns((current) =>
          current.map((turn) => (turn.id === id && !turn.answer ? { ...turn, error: "Stopped. The answer is still kept in this conversation." } : turn)),
        );
      } else if (caught instanceof ApiError && caught.status === 409) {
        setError("This conversation's document or knowledge base was deleted. Start a new question.");
      } else if (caught instanceof ApiError && caught.status === 429) {
        setError(`You can ask 20 questions a minute and 2 at once. Try again in ${caught.retryAfter ?? 60} seconds.`);
      } else {
        setError(caught instanceof ApiError ? caught.detail : "The question did not reach DocForge. Try again.");
      }
      onTurns((current) => current.filter((turn) => turn.id !== id || turn.answer || turn.error));
    } finally {
      setStage(null);
      controller.current = null;
    }
  };

  return (
    <div className={`thread${compact ? " compact" : ""}`}>
      <p className="sr-only" role="status" aria-live="polite">
        {announce}
      </p>
      <ol className="turns">
        {turns.map((turn, index) => (
          <li key={turn.id} className="turn">
            <p className="turn-meta">You · {localTime(turn.asked)}</p>
            <p className="turn-question">{turn.question}</p>
            {turn.answer && (
              <AnswerView answer={turn.answer} asked={turn.asked} onQuote={quote} anchor={index === turns.length - 1 ? newest : undefined} />
            )}
            {turn.error && (
              <Alert kind="fail" title="No answer.">
                {turn.error}
              </Alert>
            )}
            {!turn.answer && !turn.error && streaming && index === turns.length - 1 && (
              <ol className="stream-stages" aria-hidden="true">
                {STAGES.map((name) => {
                  const at = STAGES.indexOf(stage?.stage as (typeof STAGES)[number]);
                  const mine = STAGES.indexOf(name);
                  const state = mine < at ? "done" : mine === at ? "current" : "pending";
                  return (
                    <li key={name} data-state={state}>
                      <span className="stage-box">{state === "done" ? "✓" : ""}</span>
                      {STAGE_WORDS[name](stage?.stage === name ? stage : null)}
                    </li>
                  );
                })}
              </ol>
            )}
          </li>
        ))}
      </ol>

      {error && (
        <Alert kind="fail" title="Not asked.">
          {error}
        </Alert>
      )}

      <form className="composer" onSubmit={ask}>
        <label htmlFor="composer-input" className="label">
          Ask a question. Every statement in the answer rests on a quote you can open.
        </label>
        <div className="composer-row">
          <textarea
            id="composer-input"
            className="input"
            rows={2}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (sendsOnEnter(e.nativeEvent)) {
                e.preventDefault();
                void ask();
              }
            }}
          />
          {streaming ? (
            <button type="button" className="btn btn-secondary" onClick={() => controller.current?.abort()}>
              Stop
            </button>
          ) : (
            <button type="submit" className="btn btn-primary" disabled={!question.trim()}>
              Ask
            </button>
          )}
        </div>
        {streaming && <p className="muted" style={{ fontSize: 12 }}>Stopping keeps the answer in this conversation.</p>}
      </form>
    </div>
  );
}

function AnswerView({
  answer, asked, onQuote, anchor,
}: { answer: Answer; asked: string; onQuote: (c: Citation, n: number) => void; anchor?: React.RefObject<HTMLDivElement | null> }) {  // prettier-ignore
  const badge = answerBadge(answer);
  const note = answerNote(answer);
  return (
    <div className="answer" ref={anchor} tabIndex={-1} role="region" aria-label="Answer">
      <p className="turn-meta" style={{ display: "flex", gap: 8, alignItems: "center" }}>
        DocForge · {localTime(asked)}
        <StatusBadge kind={badge.kind} icon={BADGE_ICONS[badge.kind]}>
          {badge.word}
        </StatusBadge>
      </p>
      <p className="answer-text num">
        {answer.status === "not_found" && !answer.text ? "The documents do not say." : answer.text}
        {answer.citations.map((citation, index) => (
          <button key={index} className="cite" aria-label={`Quote ${index + 1}, show on page`} onClick={() => onQuote(citation, index + 1)}>
            {index + 1}
          </button>
        ))}
      </p>
      {note && (
        <p className={`reason-box reason-${answer.status === "unsupported" ? "fail" : answer.status === "partly_supported" ? "warn" : "info"}`} style={{ fontSize: 13 }}>
          {note}
        </p>
      )}
      {answer.words_only && (
        <p className="reason-box reason-warn" style={{ fontSize: 13 }}>
          <b>Only exact words were matched.</b> Meaning-based search is unavailable right now, so passages that say the same thing in other words may be missing.
        </p>
      )}
      {answer.citations.length > 0 && (
        <div className="quote-grid">
          {answer.citations.map((citation, index) => (
            <button key={index} className="quote-card marked" onClick={() => onQuote(citation, index + 1)}>
              <Marks />
              <span className="kicker">
                {index + 1} · {citation.filename} · page {citation.page}
              </span>
              <span className="quote">“{citation.quote}”</span>
              <span className="go">Show on page →</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
