import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({
  api,
  ApiError: class extends Error {
    detail = "Not allowed.";
  },
}));

import { WorkspaceSettings } from "@/components/WorkspaceSettings";

const defaults = { near_expiry_months: 6, updated_by: null, updated_at: null };

beforeEach(() => {
  api.mockReset();
  api.mockImplementation((_path: string, init?: { method?: string; json?: { near_expiry_months: number } }) =>
    Promise.resolve(
      init?.method === "PATCH" ? { near_expiry_months: init.json?.near_expiry_months, updated_by: "Asha Rao", updated_at: "2026-10-17T10:00:00Z" } : defaults,
    ),
  );
});

describe("workspace settings (V2 3.4)", () => {
  it("shows the near-expiry window to someone who cannot change it", async () => {
    render(<WorkspaceSettings mayChange={false} />);

    expect(await screen.findByText("6 months")).toBeInTheDocument();
    expect(screen.getByText(/only an administrator can change it/)).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("lets an administrator change it, and says who did", async () => {
    render(<WorkspaceSettings mayChange />);
    const input = await screen.findByLabelText("Flag stock expiring within (months)");
    expect(input).toHaveValue("6");

    await userEvent.clear(input);
    await userEvent.type(input, "9");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(api).toHaveBeenLastCalledWith("/settings", { method: "PATCH", json: { near_expiry_months: 9 } });
    expect(await screen.findByRole("status")).toHaveTextContent("Saved.");
    expect(screen.getByText(/Last changed by Asha Rao/)).toBeInTheDocument();
  });

  it("refuses a window that is not 0 to 36 whole months without asking the API", async () => {
    render(<WorkspaceSettings mayChange />);
    const input = await screen.findByLabelText("Flag stock expiring within (months)");

    for (const wrong of ["37", "2.5", "-1", "six"]) {
      await userEvent.clear(input);
      await userEvent.type(input, wrong);
      await userEvent.click(screen.getByRole("button", { name: "Save" }));
      expect(screen.getByText("Enter a whole number of months from 0 to 36.")).toBeInTheDocument();
    }
    expect(api).toHaveBeenCalledTimes(1); // only the load
  });

  it("says 0 is off", async () => {
    api.mockResolvedValue({ near_expiry_months: 0, updated_by: "Asha Rao", updated_at: null });
    render(<WorkspaceSettings mayChange={false} />);

    expect(await screen.findByText("Off")).toBeInTheDocument();
  });

  it("says so when the settings cannot be loaded", async () => {
    api.mockRejectedValue(new Error("down"));
    render(<WorkspaceSettings mayChange />);

    expect(await screen.findByText(/could not be loaded/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });
});
