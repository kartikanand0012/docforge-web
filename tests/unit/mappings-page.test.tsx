import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => vi.fn());
const who = vi.hoisted(() => ({ role: "reviewer", viewing: false }));
vi.mock("@/lib/api", () => ({ api, apiUrl: (path: string) => `/api/v1${path}`, ApiError: class extends Error {} }));
vi.mock("@/components/Shell", () => ({
  useCaller: () => ({ kind: "session", name: "Asha", email: null, role: who.role, organisation: "Shah Medicals" }),
  useViewing: () => who.viewing,
}));

import MappingsPage from "@/app/(app)/settings/mappings/page";

beforeEach(() => {
  api.mockReset();
  api.mockResolvedValue({ items: [], total: 0, next_after: null });
});

describe("the Mappings screen (V2 P1)", () => {
  it("offers adding and importing to those who review, and switches between suppliers and items", async () => {
    who.role = "reviewer";
    who.viewing = false;
    render(<MappingsPage />);
    expect(await screen.findByRole("button", { name: "Add supplier" })).toBeInTheDocument();
    expect(screen.getByLabelText("Import names from Tally / Marg (CSV)")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "Items" }));
    expect(api).toHaveBeenLastCalledWith("/settings/mappings/items?limit=50");
    expect(await screen.findByRole("button", { name: "Add item" })).toBeInTheDocument();
  });

  it.each([
    { role: "reader", viewing: false },
    { role: "admin", viewing: true },
  ])("shows a $role (viewing: $viewing) the lists only", async ({ role, viewing }) => {
    who.role = role;
    who.viewing = viewing;
    render(<MappingsPage />);
    expect(await screen.findByText(/No suppliers mapped yet/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add supplier" })).toBeNull();
    expect(screen.queryByLabelText("Import names from Tally / Marg (CSV)")).toBeNull();
    expect(screen.getByText(/Only someone who reviews bills can change them/)).toBeInTheDocument();
  });
});
