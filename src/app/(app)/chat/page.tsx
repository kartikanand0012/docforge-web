"use client";

import { List, Plus } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { ChatThread, type Turn } from "@/components/chat/ChatThread";
import { Tag } from "@/components/ui";
import { api } from "@/lib/api";
import type { Answer, Citation, ChatStatus } from "@/lib/chat";
import { localTime } from "@/lib/format";

type Summary = { id: string; title: string; document_id: string | null; created_at: string };
type Message = { id: string; question: string; answer: string; status: string; citations: Citation[]; created_at: string };

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="screen" aria-busy="true" />}>
      <Chat />
    </Suspense>
  );
}

function toTurns(conversationId: string, messages: Message[]): Turn[] {
  return messages.map((message) => ({
    id: message.id,
    question: message.question,
    asked: message.created_at,
    error: null,
    answer: {
      conversation_id: conversationId, message_id: message.id, status: message.status as ChatStatus, text: message.answer,
      citations: message.citations, dropped_citations: 0, dropped_statements: 0, reason: null, reason_detail: {}, words_only: false,
    } satisfies Answer,
  }));  // prettier-ignore
}

function Chat() {
  const router = useRouter();
  const search = useSearchParams();
  const conversation = search.get("c");
  const documentId = search.get("document") ?? undefined;
  const collectionId = search.get("collection") ?? undefined;
  const [list, setList] = useState<Summary[]>([]);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [sheet, setSheet] = useState(false);
  const loads = useRef(0);
  // The conversation a question here just began: its streamed turns already hold more than
  // the stored messages do (the reason an answer was not found), so they are kept.
  const begun = useRef<string | null>(null);

  const refreshList = useCallback(() => api<Summary[]>("/conversations").then(setList).catch(() => undefined), []);
  useEffect(() => {
    void refreshList();
  }, [refreshList]);

  // A conversation's messages, newest load only; a new question starts empty.
  useEffect(() => {
    if (conversation && conversation === begun.current) return;
    const ticket = ++loads.current;
    const loading = conversation
      ? api<{ id: string; messages: Message[] }>(`/conversations/${conversation}`).then((found) => toTurns(found.id, found.messages))
      : Promise.resolve([] as Turn[]);
    loading.then(
      (found) => ticket === loads.current && setTurns(found),
      () => ticket === loads.current && setTurns([]),
    );
  }, [conversation]);

  const current = list.find((item) => item.id === conversation);
  const title = current?.title ?? (turns[0]?.question || "New question");
  const scope = current?.document_id || documentId ? "This document" : collectionId ? "Knowledge base" : "All documents";

  const conversations = (
    <nav className="conversations" aria-label="Conversations">
      <div className="conversations-head">
        <h1 style={{ fontSize: 26 }}>Chat</h1>
        <button className="btn btn-secondary" onClick={() => router.push("/chat")}>
          <Plus size={14} strokeWidth={1.5} aria-hidden="true" /> New question
        </button>
      </div>
      <ul>
        {list.map((item) => (
          <li key={item.id}>
            <button
              className="conversation"
              aria-current={item.id === conversation ? "true" : undefined}
              onClick={() => {
                setSheet(false);
                router.push(`/chat?c=${item.id}`);
              }}
            >
              <span className="conversation-title">{item.title}</span>
              <span className="muted" style={{ fontSize: 12 }}>
                {item.document_id ? "One document" : "All documents"} · {localTime(item.created_at)}
              </span>
            </button>
          </li>
        ))}
        {!list.length && <li className="muted" style={{ padding: "8px 4px", fontSize: 13 }}>Questions you ask appear here.</li>}
      </ul>
    </nav>
  );

  return (
    <div className="chat-screen">
      <div className="chat-list">{conversations}</div>
      {sheet && (
        <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setSheet(false)}>
          <div className="dialog" role="dialog" aria-modal="true" aria-label="Conversations">
            {conversations}
          </div>
        </div>
      )}
      <section className="chat-main" aria-label={title}>
        <header className="chat-header">
          <button className="btn btn-secondary btn-icon chat-sheet-button" aria-label="Conversations" onClick={() => setSheet(true)}>
            <List size={16} strokeWidth={1.5} aria-hidden="true" />
          </button>
          <h2 style={{ fontSize: 20 }}>{title}</h2>
          <Tag tone="neutral">Scope: {scope}</Tag>
        </header>
        <div className="chat-body">
          <ChatThread
            turns={turns}
            onTurns={setTurns}
            conversationId={conversation}
            scope={{ documentId, collectionId }}
            onConversation={(id) => {
              begun.current = id;
              void refreshList();
              router.replace(`/chat?c=${id}`);
            }}
          />
        </div>
      </section>
    </div>
  );
}
