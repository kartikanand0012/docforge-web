"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { stream } from "@/lib/sse";
import { isFinished } from "@/lib/stages";

export type Live = { stage: string; detail?: string | null };

const STREAMS = 5; // the API allows five open event streams per person
const POLL_MS = 4000;
const STREAM_FOR_MS = 10 * 60 * 1000; // a stream ends after ten minutes; polling takes over

/** The live stage of each document asked about: the first five by their event stream, the
 * rest - and any whose stream ends (refused, timed out, cut) before the document finishes -
 * by polling. A document read again is followed again, because only the ids asked about now
 * count; one that has finished is left alone. */
export function useLiveStages(ids: string[]): Record<string, Live> {
  const [live, setLive] = useState<Record<string, Live>>({});
  const key = [...new Set(ids)].sort().join(",");

  useEffect(() => {
    const wanted = key ? key.split(",") : [];
    if (!wanted.length) return;
    let cancelled = false; // only the effect's own cleanup stops following
    const finished = new Set<string>();
    const polled = new Set(wanted.slice(STREAMS));
    const controllers: AbortController[] = [];
    let timer: ReturnType<typeof setTimeout> | undefined;

    const update = (id: string, next: Live) => {
      if (isFinished(next.stage)) finished.add(id);
      setLive((current) => (current[id]?.stage === next.stage ? current : { ...current, [id]: next }));
    };

    for (const id of wanted.slice(0, STREAMS)) {
      const controller = new AbortController();
      controllers.push(controller);
      const limit = setTimeout(() => controller.abort(), STREAM_FOR_MS);
      (async () => {
        try {
          for await (const event of stream(`/documents/${id}/events`, { signal: controller.signal })) {
            if (event.name === "stage") update(id, event.data as unknown as Live);
          }
        } catch {
          /* refused (429), cut or timed out: polling takes over below */
        } finally {
          clearTimeout(limit);
          if (!cancelled && !finished.has(id)) polled.add(id);
        }
      })();
    }

    // One poll at a time: the next is scheduled only when this one has finished.
    const poll = async () => {
      for (const id of [...polled]) {
        if (cancelled) return;
        if (finished.has(id)) {
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
      if (!cancelled) timer = setTimeout(poll, POLL_MS);
    };
    timer = setTimeout(poll, POLL_MS);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      controllers.forEach((controller) => controller.abort());
    };
  }, [key]);

  return live;
}
