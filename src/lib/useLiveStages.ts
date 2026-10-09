"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { stream } from "@/lib/sse";
import { isFinished } from "@/lib/stages";

export type Live = { stage: string; detail?: string | null };

const STREAMS = 5; // the API allows five open event streams per person
const POLL_MS = 4000;
const STREAM_FOR_MS = 10 * 60 * 1000; // a stream ends after ten minutes; polling takes over

/** The live stage of each document still being read: the first five by their event stream,
 * the rest (and any refused stream) by polling. Finished documents are left alone. */
export function useLiveStages(ids: string[]): Record<string, Live> {
  const [live, setLive] = useState<Record<string, Live>>({});
  const key = [...new Set(ids)].sort().join(",");
  const done = useRef(new Set<string>());

  useEffect(() => {
    const wanted = key ? key.split(",").filter((id) => !done.current.has(id)) : [];
    if (!wanted.length) return;
    const controllers: AbortController[] = [];
    const polled = new Set(wanted.slice(STREAMS));
    const update = (id: string, next: Live) => {
      if (isFinished(next.stage)) done.current.add(id);
      setLive((current) => (current[id]?.stage === next.stage ? current : { ...current, [id]: next }));
    };

    for (const id of wanted.slice(0, STREAMS)) {
      const controller = new AbortController();
      controllers.push(controller);
      const stop = setTimeout(() => controller.abort(), STREAM_FOR_MS);
      (async () => {
        try {
          for await (const event of stream(`/documents/${id}/events`, { signal: controller.signal })) {
            if (event.name === "stage") update(id, event.data as unknown as Live);
          }
        } catch {
          /* refused (429) or ended: poll instead */
        } finally {
          clearTimeout(stop);
          if (!done.current.has(id) && !controller.signal.aborted) polled.add(id);
        }
      })();
    }

    const timer = setInterval(async () => {
      for (const id of [...polled]) {
        if (done.current.has(id)) {
          polled.delete(id);
          continue;
        }
        try {
          const found = await api<{ document: { stage: string } }>(`/documents/${id}`);
          update(id, { stage: found.document.stage });
        } catch {
          /* try again next time */
        }
      }
    }, POLL_MS);

    return () => {
      clearInterval(timer);
      controllers.forEach((controller) => controller.abort());
    };
  }, [key]);

  return live;
}
