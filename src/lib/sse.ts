/** Server-sent events read with fetch and a stream reader (not EventSource, which cannot POST
 * or keep the same-origin cookie pattern simply). The last event may come without its blank
 * line. Ported from the old app's chat.ts. */

import { apiUrl, errorFrom, toLogin } from "@/lib/api";

export type StreamEvent = { name: string; data: Record<string, unknown> };

export function readEvents(buffer: string, options: { final?: boolean } = {}): { events: StreamEvent[]; rest: string } {
  // Line ends may be CRLF, CR or LF; a CR at the very end may be half of a CRLF still to come.
  const held = !options.final && buffer.endsWith("\r") ? "\r" : "";
  const text = (held ? buffer.slice(0, -1) : buffer).replace(/\r\n?/g, "\n");
  const blocks = text.split("\n\n");
  const rest = options.final ? "" : (blocks.pop() ?? "") + held;
  const events: StreamEvent[] = [];
  for (const block of blocks) {
    let name = "message";
    let data = "";
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) name = line.slice(6).trim();
      else if (line.startsWith("data:")) data += line.slice(5).trimStart();
    }
    if (!data) continue;
    try {
      events.push({ name, data: JSON.parse(data) as Record<string, unknown> });
    } catch {
      /* not an event this app understands */
    }
  }
  return { events, rest };
}

/** Each event of a stream, as it arrives. Throws ApiError when the stream cannot open. */
export async function* stream(
  path: string,
  init: RequestInit & { json?: unknown; signal?: AbortSignal } = {},
): AsyncGenerator<StreamEvent> {
  const { json, ...rest } = init;
  const response = await fetch(apiUrl(path), {
    ...rest,
    headers: {
      ...(rest.headers as Record<string, string> | undefined),
      Accept: "text/event-stream",
      ...(json === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: json === undefined ? undefined : JSON.stringify(json),
    cache: "no-store",
  });
  if (!response.ok || !response.body) {
    if (response.status === 401) toLogin();
    throw errorFrom(response.status, await response.json().catch(() => null), response.headers);
  }
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      const read = readEvents(buffer + value);
      buffer = read.rest;
      yield* read.events;
    }
    yield* readEvents(buffer, { final: true }).events;
  } finally {
    // A reader that stops early (Stop, leaving the page) lets the connection go.
    await reader.cancel().catch(() => undefined);
  }
}
