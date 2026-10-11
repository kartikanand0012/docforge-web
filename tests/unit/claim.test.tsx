import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({
  api,
  apiUrl: (path: string) => `/api/v1${path}`,
  ApiError: class ApiError extends Error {
    constructor(
      readonly status: number,
      readonly detail: string,
    ) {
      super(detail);
    }
  },
}));

import { heldByOther, RENEW_EVERY, useReviewClaim } from "@/lib/claim";

const fetchSpy = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
const theirs = { reviewer_name: "Priya Nair", claimed_at: "2026-10-09T10:42:00Z", expires_at: "2026-10-09T10:47:00Z", mine: false };

beforeEach(() => {
  vi.useFakeTimers();
  api.mockReset();
  fetchSpy.mockClear();
  vi.stubGlobal("fetch", fetchSpy);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("a review claim", () => {
  it("is held by another only when someone else's claim is known", () => {
    expect(heldByOther(null)).toBe(false);
    expect(heldByOther({ ...theirs, mine: true })).toBe(false);
    expect(heldByOther(theirs)).toBe(true);
  });

  it("is asked for on opening, renewed while open, and let go on closing", async () => {
    api.mockResolvedValue({ ...theirs, mine: true });
    const { result, unmount } = renderHook(() => useReviewClaim("d1", true));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(api).toHaveBeenCalledWith("/documents/d1/claim", { method: "POST", json: { take_over: false } });
    expect(result.current.claim?.mine).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(RENEW_EVERY * 2);
    });
    expect(api).toHaveBeenCalledTimes(3);

    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchSpy).toHaveBeenCalledWith("/api/v1/documents/d1/claim", { method: "DELETE", keepalive: true });
  });

  it("is let go only after an ask on its way has landed, so the ask cannot undo the release", async () => {
    let land: (claim: unknown) => void = () => undefined;
    api.mockImplementationOnce(() => new Promise((resolve) => (land = resolve)));
    const { unmount } = renderHook(() => useReviewClaim("d1", true));
    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    await act(async () => {
      land({ ...theirs, mine: true });
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("is asked for again when the page comes back from the back-forward cache", async () => {
    api.mockResolvedValue({ ...theirs, mine: true });
    renderHook(() => useReviewClaim("d1", true));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(api).toHaveBeenCalledTimes(1);
    await act(async () => {
      window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: false }));
      window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(api).toHaveBeenCalledTimes(2);
  });

  it("takes over once however often the button is pressed, and is busy meanwhile", async () => {
    let land: (claim: unknown) => void = () => undefined;
    api.mockResolvedValueOnce(theirs).mockImplementationOnce(() => new Promise((resolve) => (land = resolve)));
    const { result } = renderHook(() => useReviewClaim("d1", true));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    let first: Promise<void> = Promise.resolve();
    act(() => {
      first = result.current.takeOver();
      void result.current.takeOver();
    });
    expect(result.current.takingOver).toBe(true);
    await act(async () => {
      land({ ...theirs, mine: true });
      await first;
    });
    expect(api.mock.calls.filter(([, init]) => init.json.take_over)).toHaveLength(1);
    expect(result.current.takingOver).toBe(false);
    expect(result.current.claim?.mine).toBe(true);
  });

  it("drops a take-over that answers after moving to another document", async () => {
    let land: (claim: unknown) => void = () => undefined;
    api.mockImplementation((_path: string, init: { json: { take_over: boolean } }) =>
      init.json.take_over ? new Promise((resolve) => (land = resolve)) : Promise.resolve(theirs),
    );
    const { result, rerender } = renderHook(({ id }) => useReviewClaim(id, true), { initialProps: { id: "d1" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.takeOver();
    });
    rerender({ id: "d2" });
    await act(async () => {
      land({ ...theirs, reviewer_name: "You", mine: true });
      await pending;
    });
    expect(result.current.claim?.reviewer_name).toBe("Priya Nair");
  });

  it("is not asked for when nothing on screen can change", async () => {
    renderHook(() => useReviewClaim("d1", false));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RENEW_EVERY);
    });
    expect(api).not.toHaveBeenCalled();
  });

  it("shows who holds it, and a refused take-over says why", async () => {
    api.mockResolvedValueOnce(theirs).mockRejectedValueOnce(new (await import("@/lib/api")).ApiError(403, "Only an administrator can take over a review."));
    const { result } = renderHook(() => useReviewClaim("d1", true));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(heldByOther(result.current.claim)).toBe(true);
    await act(async () => {
      await result.current.takeOver();
    });
    expect(result.current.takeOverError).toBe("Only an administrator can take over a review.");
    expect(result.current.claim?.reviewer_name).toBe("Priya Nair");
  });
});
