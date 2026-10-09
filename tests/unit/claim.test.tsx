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
    expect(fetchSpy).toHaveBeenCalledWith("/api/v1/documents/d1/claim", { method: "DELETE", keepalive: true });
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
