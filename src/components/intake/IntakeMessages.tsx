"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { MessageCard } from "@/components/intake/MessageCard";
import { Alert, Seg } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { SETTINGS_PATH, VIEWS, listMessages, type IntakeMessage, type IntakeView } from "@/lib/intake";

const EMPTY: Record<IntakeView, string> = {
  all: "No mail yet. Forward a bill to your workspace's address, or send a test invoice from the Email intake settings.",
  held: "No mail is held for review.",
  failed: "No emailed document failed to read.",
  ignored: "No attachment was ignored or refused.",
  rejected: "No mail was rejected.",
};

type Props = { view: IntakeView; onView: (view: IntakeView) => void; mayDecide: boolean };

/** The Intake list, filtered by view; Accept, Discard and Retry for whoever reviews bills. */
export function IntakeMessages({ view, onView, mayDecide }: Props) {
  const [messages, setMessages] = useState<IntakeMessage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loads = useRef(0);

  const load = (which: IntakeView) => {
    const ticket = ++loads.current;
    listMessages(which).then(
      (found) => {
        if (ticket !== loads.current) return;
        setMessages(found);
        setError(null);
      },
      (caught: unknown) => {
        if (ticket !== loads.current) return;
        setError(caught instanceof ApiError ? caught.detail : "The mail received could not be loaded.");
      },
    );
  };

  useEffect(() => {
    const ticket = ++loads.current;
    listMessages(view).then(
      (found) => {
        if (ticket !== loads.current) return;
        setMessages(found);
        setError(null);
      },
      (caught: unknown) => {
        if (ticket !== loads.current) return;
        setError(caught instanceof ApiError ? caught.detail : "The mail received could not be loaded.");
      },
    );
  }, [view]);

  const changed = (message: IntakeMessage) => {
    setMessages((current) => current?.map((shown) => (shown.id === message.id ? message : shown)) ?? null);
    load(view); // it may have left this view
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="filters">
        <Seg
          name="intake-view"
          label="Show"
          value={view}
          onChange={(next) => {
            setMessages(null);
            onView(next);
          }}
          options={VIEWS}
        />
        {messages && (
          <span className="muted" style={{ marginLeft: "auto" }}>
            Showing {messages.length}
          </span>
        )}
      </div>
      {error && (
        <Alert kind="fail" title="Not loaded.">
          {error}
        </Alert>
      )}
      {messages === null && !error && (
        <p className="muted" aria-busy="true">
          Loading…
        </p>
      )}
      {messages?.length === 0 && (
        <p className="muted">
          {EMPTY[view]} {view === "all" && <Link href={SETTINGS_PATH}>Open Email intake settings</Link>}
        </p>
      )}
      {messages && messages.length > 0 && (
        <ul className="intake-messages" aria-label="Mail received">
          {messages.map((message) => (
            <MessageCard key={message.id} message={message} mayDecide={mayDecide} onChanged={changed} onRetried={() => load(view)} />
          ))}
        </ul>
      )}
    </div>
  );
}
