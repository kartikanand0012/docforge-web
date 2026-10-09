import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const streams = vi.hoisted(() => ({ handlers: [] as { abort: () => void }[] }));
vi.mock("@/lib/sse", () => ({
  // A stream that stays open until it is aborted, then ends cleanly (as the API's does).
  stream: (_path: string, init: { signal: AbortSignal }) =>
    (async function* () {
      await new Promise<void>((resolve) => init.signal.addEventListener("abort", () => resolve()));
    })(),
}));
const api = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ api }));

import { useLiveStages } from "@/lib/useLiveStages";

beforeEach(() => {
  vi.useFakeTimers();
  api.mockReset();
  streams.handlers.length = 0;
});
afterEach(() => vi.useRealTimers());

describe("live stages (TypeScript review H2)", () => {
  it("keep coming by polling once a stream reaches its ten-minute limit", async () => {
    api.mockResolvedValue({ document: { stage: "extracting" } });
    const { result } = renderHook(() => useLiveStages(["d1"]));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * 60 * 1000 + 5000);
    });

    expect(api).toHaveBeenCalledWith("/documents/d1");
    expect(result.current.d1?.stage).toBe("extracting");
  });
});
