import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => vi.fn());
const who = vi.hoisted(() => ({ role: "admin", viewing: false }));
vi.mock("@/lib/api", () => ({
  api,
  apiUrl: (path: string) => `/api/v1${path}`,
  ApiError: class extends Error {
    constructor(
      readonly status: number,
      readonly detail: string,
    ) {
      super(detail);
    }
  },
}));
vi.mock("@/components/Shell", () => ({
  useCaller: () => ({ kind: "session", name: "Asha", email: null, role: who.role, organisation: "Shah Medicals" }),
  useViewing: () => who.viewing,
}));

import IntakeSettingsPage from "@/app/(app)/settings/intake/page";
import { POLL_MS } from "@/components/intake/IntakeSetup";
import { ApiError } from "@/lib/api";
import type { IntakeMessage, IntakeSettings } from "@/lib/intake";

const MASKED = "shah-medicals-••••••••@in.docforge.example";
const WHOLE = "shah-medicals-abcdefghijklmnopqrstuvwxyz@in.docforge.example";
const MADE = { created_by: "Asha", created_at: "2026-11-03T06:00:00Z" };

const settings = (overrides: Partial<IntakeSettings> = {}): IntakeSettings => ({
  enabled: true, domain: "in.docforge.example", address: { address: MASKED, whole: false, ...MADE },
  senders: [{ id: "s1", sender: "@supplier.in", ...MADE }], trust_accepted: false, per_sender_hourly: 50, ...overrides,
});  // prettier-ignore

const testMail = (status: string | null, documentId: string | null = "d9"): IntakeMessage => ({
  id: "m9", sender: "intake-test@in.docforge.example", subject: "DocForge intake test", status: "received", reason: null,
  received_at: "2026-11-03T06:00:00Z", decided_by: null, decided_at: null,
  items: [{ id: "i9", position: 0, filename: "docforge-sample-invoice.pdf", size_bytes: 3000, outcome: "received", reason: null, document_id: documentId, document_status: status }],
});  // prettier-ignore

type Init = { method?: string; json?: unknown };
type Handler = (path: string, init?: Init) => unknown;
let current: IntakeSettings;
function serve(handler: Handler) {
  api.mockImplementation((path: string, init?: Init) => {
    try {
      return Promise.resolve(handler(path, init));
    } catch (error) {
      return Promise.reject(error);
    }
  });
}
const base: Handler = (path, init) => {
  if (path === "/settings/intake" && !init?.method) return current;
  if (path === "/settings/intake/address") {
    current = settings({ address: { address: MASKED, whole: false, ...MADE } });
    return settings({ address: { address: WHOLE, whole: true, ...MADE } });
  }
  if (path === "/settings/intake" && init?.method === "PATCH") {
    current = { ...current, ...(init.json as object) };
    return current;
  }
  if (path === "/settings/intake/senders" && init?.method === "POST") {
    const sender = (init.json as { sender: string }).sender;
    if (!sender.includes("@")) throw new ApiError(422, "Enter a whole address (name@domain.in) or @ and a domain (@domain.in).");
    if (sender === "@supplier.in") throw new ApiError(422, "@supplier.in is already on the list.");
    return { id: "s2", sender, ...MADE };
  }
  if (path.startsWith("/settings/intake/senders/") && init?.method === "DELETE") return undefined;
  throw new Error(`unexpected ${init?.method ?? "GET"} ${path}`);
};

const calls = (method: string) => api.mock.calls.filter(([, init]) => (init?.method ?? "GET") === method).map(([path, init]) => [path, init?.json]);

beforeEach(() => {
  api.mockReset();
  who.role = "admin";
  who.viewing = false;
  current = settings();
  serve(base);
});
afterEach(() => vi.useRealTimers());

describe("Settings › Email intake (V2 P5)", () => {
  it("says plainly when intake is not set up on this server, with no buttons to press", async () => {
    current = settings({ enabled: false, domain: null, address: null, senders: [] });
    render(<IntakeSettingsPage />);
    expect(await screen.findByText("Email intake is not set up on this server yet.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows the whole address with Copy only right after making it, and masked after a reload", async () => {
    current = settings({ address: null });
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const { unmount } = render(<IntakeSettingsPage />);
    expect(await screen.findByText(/No address yet/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Make the address" }));

    expect(await screen.findByText(WHOLE)).toBeInTheDocument();
    expect(screen.getByText("Copy it now: for safety it is shown only once.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(writeText).toHaveBeenCalledWith(WHOLE);
    expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();
    expect(calls("POST")).toEqual([["/settings/intake/address", undefined]]);

    unmount();
    render(<IntakeSettingsPage />);
    expect(await screen.findByText(MASKED)).toBeInTheDocument();
    expect(screen.queryByText(WHOLE)).toBeNull();
    expect(screen.queryByRole("button", { name: "Copy" })).toBeNull();
    expect(screen.queryByText("Copy it now: for safety it is shown only once.")).toBeNull();
  });

  it("asks before making a new address, saying the old one stops at once", async () => {
    const user = userEvent.setup();
    render(<IntakeSettingsPage />);
    await user.click(await screen.findByRole("button", { name: "Make a new address…" }));
    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveTextContent("The old address stops working at once");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(calls("POST")).toEqual([]);

    await user.click(screen.getByRole("button", { name: "Make a new address…" }));
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Make a new address" }));
    expect(await screen.findByText(WHOLE)).toBeInTheDocument();
    expect(calls("POST")).toEqual([["/settings/intake/address", undefined]]);
    await user.click(screen.getByRole("button", { name: "Done, I have copied it" }));
    expect(screen.queryByText(WHOLE)).toBeNull();
    expect(screen.getByText(MASKED)).toBeInTheDocument();
  });

  it("adds and removes senders, and shows the API's refusal word for word", async () => {
    const user = userEvent.setup();
    render(<IntakeSettingsPage />);
    const box = await screen.findByLabelText("An address or @domain");
    await user.type(box, "@supplier.in");
    await user.click(screen.getByRole("button", { name: "Add sender" }));
    expect(await screen.findByText("@supplier.in is already on the list.")).toBeInTheDocument();

    await user.clear(box);
    await user.type(box, "asha@pharma.in");
    await user.click(screen.getByRole("button", { name: "Add sender" }));
    const list = screen.getByRole("list", { name: "Senders" });
    expect(await within(list).findByText("asha@pharma.in")).toBeInTheDocument();
    expect(box).toHaveValue("");

    await user.click(screen.getByRole("button", { name: "Remove @supplier.in" }));
    expect(within(list).queryByText("@supplier.in")).toBeNull();
    expect(calls("POST")).toEqual([
      ["/settings/intake/senders", { sender: "@supplier.in" }],
      ["/settings/intake/senders", { sender: "asha@pharma.in" }],
    ]);
    expect(calls("DELETE")).toEqual([["/settings/intake/senders/s1", undefined]]);
  });

  it("saves the trust toggle and the hourly number", async () => {
    const user = userEvent.setup();
    render(<IntakeSettingsPage />);
    const toggle = await screen.findByRole("checkbox", { name: "Trust a sender once a held mail is accepted" });
    expect(toggle).not.toBeChecked();
    await user.click(toggle);
    expect(await screen.findByText("Saved: a sender is trusted once a held mail is accepted.")).toBeInTheDocument();
    expect(toggle).toBeChecked();

    const hourly = screen.getByLabelText("Documents an hour from one sender");
    await user.clear(hourly);
    await user.type(hourly, "0");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText(/Enter a whole number from 1 to/)).toBeInTheDocument();
    await user.clear(hourly);
    await user.type(hourly, "20");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Saved: at most 20 documents an hour from one sender.")).toBeInTheDocument();
    expect(calls("PATCH")).toEqual([
      ["/settings/intake", { trust_accepted: true }],
      ["/settings/intake", { per_sender_hourly: 20 }],
    ]);
  });

  it("sends a test invoice and watches it arrive, linking to its document", async () => {
    vi.useFakeTimers();
    let polls = 0;
    serve((path, init) => {
      if (path === "/settings/intake/test") return testMail("received");
      if (path === "/intake/messages?view=all&limit=5") {
        polls += 1;
        return [testMail(polls === 1 ? "processing" : "processed")];
      }
      return base(path, init);
    });
    render(<IntakeSettingsPage />);
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "Send a test invoice" }));
    await act(async () => {});
    expect(screen.getByText("Arrived. Watching it being read…")).toBeInTheDocument();
    expect(screen.getByText("docforge-sample-invoice.pdf")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS);
    });
    expect(polls).toBe(1);
    expect(screen.getByText(/document being read/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open the document" })).toHaveAttribute("href", "/documents/d9");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS);
    });
    expect(polls).toBe(2);
    expect(screen.getByText(/document read/)).toBeInTheDocument();
    expect(screen.getByText("Arrived.")).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_MS * 5);
    });
    expect(polls).toBe(2); // it stopped looking once the document was read
  });

  it("says why a test cannot be sent without an address", async () => {
    current = settings({ address: null });
    serve((path, init) => {
      if (path === "/settings/intake/test") throw new ApiError(409, "Make the workspace's address first.");
      return base(path, init);
    });
    const user = userEvent.setup();
    render(<IntakeSettingsPage />);
    await user.click(await screen.findByRole("button", { name: "Send a test invoice" }));
    expect(await screen.findByText("Make the workspace's address first.")).toBeInTheDocument();
  });

  it("offers no changes to a reviewer, who is pointed to the mail received", async () => {
    who.role = "reviewer";
    serve(() => {
      throw new ApiError(403, "Not allowed.");
    });
    render(<IntakeSettingsPage />);
    expect(await screen.findByText("Only an administrator can set up email intake.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getAllByRole("link", { name: "Mail received" })[0]).toHaveAttribute("href", "/intake");
  });

  it("shows an administrator viewing the workspace the settings, with nothing to change", async () => {
    who.viewing = true;
    render(<IntakeSettingsPage />);
    expect(await screen.findByText(MASKED)).toBeInTheDocument();
    expect(screen.getByText("@supplier.in")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });
});
