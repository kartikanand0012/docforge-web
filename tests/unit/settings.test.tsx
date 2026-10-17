import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({
  api,
  ApiError: class extends Error {
    constructor(
      readonly status: number,
      readonly detail: string,
    ) {
      super(detail);
    }
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

  it.each(["37", "2.5", "-1", "six", ""])("refuses %j without asking the API", async (wrong) => {
    render(<WorkspaceSettings mayChange />);
    const input = await screen.findByLabelText("Flag stock expiring within (months)");

    await userEvent.clear(input);
    if (wrong) await userEvent.type(input, wrong);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByText("Enter a whole number of months from 0 to 36.")).toBeInTheDocument();
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(api).toHaveBeenCalledTimes(1); // only the load
  });

  it("clears the error as soon as the value is edited", async () => {
    render(<WorkspaceSettings mayChange />);
    const input = await screen.findByLabelText("Flag stock expiring within (months)");
    await userEvent.clear(input);
    await userEvent.type(input, "40");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await userEvent.type(input, "{backspace}");

    expect(screen.queryByText("Enter a whole number of months from 0 to 36.")).toBeNull();
    expect(input).not.toHaveAttribute("aria-invalid");
  });

  it("does not record an unchanged window", async () => {
    render(<WorkspaceSettings mayChange />);
    await screen.findByLabelText("Flag stock expiring within (months)");

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(api).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toHaveTextContent("Saved.");
  });

  it("shows why a save was refused and lets the person try again", async () => {
    const { ApiError } = await import("@/lib/api");
    render(<WorkspaceSettings mayChange />);
    const input = await screen.findByLabelText("Flag stock expiring within (months)");
    api.mockImplementationOnce(() => Promise.reject(new ApiError(403, "Not allowed.")));

    await userEvent.clear(input);
    await userEvent.type(input, "9");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Not allowed.")).toBeInTheDocument();
    expect(input).toHaveAttribute("aria-describedby", "settings-error");
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    expect(screen.getByRole("status")).toHaveTextContent("");
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
