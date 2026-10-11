import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ api, ApiError: class extends Error {} }));

import PlatformDashboard from "@/app/(app)/admin/page";

const workspace = {
  tenant_id: "2f1c9a3e-8b7d-4c6e-9a1b-0d2e3f4a5b6c", organisation: "asha", kind: "personal", owner_name: "Asha", owner_email: "asha@example.in",
  created_at: "2026-10-01T10:00:00Z", last_active_at: null, documents: 3, pages: 5, signed: 1, questions: 2, model_cost_usd: 0.01, sign_ins: 4,
};  // prettier-ignore
const overview = {
  totals: { workspaces: 1, accounts: 1, documents: 3, pages: 5, signed: 1, questions: 2, model_cost_usd: 0.01, documents_last_7_days: 3, signups_last_7_days: 1 },
  workspaces: [workspace],
};
const event = { id: 1, occurred_at: "2026-10-01T10:00:00Z", tenant_id: workspace.tenant_id, organisation: "asha", actor_name: "Asha", action: "x", action_label: "Signed in", target_label: null };

beforeEach(() => {
  api.mockReset();
  api.mockImplementation((path: string) => Promise.resolve(path.startsWith("/platform/overview") ? overview : { items: [event], next_before: null }));
  Element.prototype.scrollIntoView = vi.fn();
});

describe("platform dashboard (React review M2, L4, L5)", () => {
  it("Activity filters to the workspace and takes focus to the Activity heading", async () => {
    render(<PlatformDashboard />);
    await screen.findByText("Signed in");
    await userEvent.click(screen.getByRole("button", { name: "Show the activity of Asha" }));
    expect(screen.getByRole("heading", { name: "Activity" })).toHaveFocus();
    expect(api).toHaveBeenLastCalledWith(`/platform/activity?limit=50&tenant_id=${encodeURIComponent(workspace.tenant_id)}`);
  });

  it("a refresh that works clears an earlier error", async () => {
    api.mockImplementationOnce(() => Promise.reject(new Error("down")));
    render(<PlatformDashboard />);
    expect(await screen.findByText("The overview could not be loaded.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await act(async () => undefined);
    expect(screen.queryByText("The overview could not be loaded.")).toBeNull();
  });

  it("opens a workspace once: View is busy while it is on its way", async () => {
    const fetchSpy = vi.fn(() => new Promise<Response>(() => undefined));
    vi.stubGlobal("fetch", fetchSpy);
    render(<PlatformDashboard />);
    const view = await screen.findByRole("button", { name: "View Asha's workspace, read only" });
    await userEvent.click(view);
    expect(view).toBeDisabled();
    await userEvent.click(view);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});
