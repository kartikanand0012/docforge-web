/** Server-sent events read with fetch and a stream reader (not EventSource, which cannot POST
 * or keep the same-origin cookie pattern simply). The last event may come without its blank
 * line. Ported from the old app's chat.ts. */

import { apiUrl, errorFrom } from "@/lib/api";

export type StreamEvent = { name: string; data: Record<string, unknown> };

export function readEvents(buffer: string, options: { final?: boolean } = {}): { events: StreamEvent[]; rest: string } {
  const blocks = buffer.split("\n\n");
  const rest = options.final ? "" : (blocks.pop() ?? "");
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
    headers: json === undefined ? rest.headers : { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: json === undefined ? undefined : JSON.stringify(json),
    cache: "no-store",
  });
  if (!response.ok || !response.body) {
    throw errorFrom(response.status, await response.json().catch(() => null), response.headers);
  }
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    const read = readEvents(buffer + value.replace(/\r\n/g, "\n"));
    buffer = read.rest;
    yield* read.events;
  }
  yield* readEvents(buffer, { final: true }).events;
}
