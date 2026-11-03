import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => vi.fn());
const who = vi.hoisted(() => ({ role: "reviewer", viewing: false }));
const nav = vi.hoisted(() => ({ search: "", replace: vi.fn(), pathname: "/intake" }));
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
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ replace: nav.replace, push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(nav.search),
}));
vi.mock("@/lib/useLiveStages", () => ({ useLiveStages: () => ({}) }));

import DocumentsPage from "@/app/(app)/documents/page";
import IntakePage from "@/app/(app)/intake/page";
import { ApiError } from "@/lib/api";
import type { IntakeItem, IntakeMessage } from "@/lib/intake";

const item = (overrides: Partial<IntakeItem> = {}): IntakeItem => ({
  id: "i1", position: 0, filename: "bill.pdf", size_bytes: 2048, outcome: "received", reason: null, document_id: "d1", document_status: "processed",
  ...overrides,
});  // prettier-ignore
const message = (overrides: Partial<IntakeMessage> = {}): IntakeMessage => ({
  id: "m1", sender: "asha@supplier.in", subject: "Bills for October", status: "received", reason: null, received_at: "2026-11-03T06:00:00Z",
  decided_by: null, decided_at: null, items: [item()], ...overrides,
});  // prettier-ignore

const HELD = message({
  id: "m2", sender: "ravi@unknown.in", subject: "Invoice", status: "held", reason: "the sender is not on this workspace's list",
  items: [item({ id: "i2", filename: "inv.pdf", outcome: "held", reason: "the sender is not on this workspace's list", document_id: null, document_status: null })],
});  // prettier-ignore
const MIXED = message({
  items: [
    item(),
    item({ id: "i3", position: 1, filename: "old.pdf", outcome: "already_received", document_id: "d0" }),
    item({ id: "i4", position: 2, filename: "winmail.dat", outcome: "ignored", reason: "winmail.dat holds Outlook's formatting, not a bill", document_id: null, document_status: null }),
    item({ id: "i5", position: 3, filename: "big.pdf", outcome: "refused", reason: "The file is too large.", document_id: null, document_status: null }),
    item({ id: "i6", position: 4, filename: "blurry.pdf", document_id: "d6", document_status: "failed" }),
  ],
});  // prettier-ignore

type Init = { method?: string; json?: unknown };
function serve(handler: (path: string, init?: Init) => unknown) {
  api.mockImplementation((path: string, init?: Init) => {
    try {
      return Promise.resolve(handler(path, init));
    } catch (error) {
      return Promise.reject(error);
    }
  });
}
const posts = () => api.mock.calls.filter(([, init]) => init?.method === "POST").map(([path]) => path);

beforeEach(() => {
  api.mockReset();
  nav.replace.mockReset();
  nav.search = "";
  nav.pathname = "/intake";
  who.role = "reviewer";
  who.viewing = false;
  serve((path) => {
    if (path.startsWith("/intake/messages?")) return [HELD, MIXED];
    if (path === "/intake/messages/m2/accept") return { ...HELD, status: "accepted", items: [item({ id: "i2", filename: "inv.pdf", document_status: "processing" })] };
    if (path === "/intake/messages/m2/discard") return { ...HELD, status: "discarded", items: [item({ id: "i2", filename: "inv.pdf", outcome: "discarded", document_id: null, document_status: null })] };
    if (path === "/intake/items/i6/retry") return undefined;
    throw new Error(`unexpected ${path}`);
  });
});

describe("Mail received (V2 P5)", () => {
  it("shows each mail and words each attachment's outcome plainly, linking to its document", async () => {
    render(<IntakePage />);
    const mixed = (await screen.findByText("Bills for October")).closest("li")!;
    expect(within(mixed).getByText(/From asha@supplier\.in/)).toBeInTheDocument();
    for (const words of [
      "received", "already received", "ignored: winmail.dat holds Outlook's formatting, not a bill", "not accepted: The file is too large.",
    ]) {  // prettier-ignore
      expect(within(mixed).getAllByText(words)[0]).toBeInTheDocument();
    }
    expect(within(mixed).getAllByRole("link", { name: "Open the document" }).map((link) => link.getAttribute("href"))).toEqual([
      "/documents/d1", "/documents/d0", "/documents/d6",
    ]);  // prettier-ignore
    const held = screen.getByText("Invoice").closest("li")!;
    expect(within(held).getByText("Held for review")).toBeInTheDocument();
    expect(within(held).getByText("held: the sender is not on this workspace's list")).toBeInTheDocument();
    expect(api).toHaveBeenCalledWith("/intake/messages?view=all&limit=50");
  });

  it("filters by view, kept in the address", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<IntakePage />);
    await screen.findByText("Bills for October");
    await user.click(screen.getByRole("radio", { name: "Held" }));
    expect(nav.replace).toHaveBeenCalledWith("/intake?view=held");
    unmount();

    nav.search = "view=failed";
    render(<IntakePage />);
    await screen.findByText("Bills for October");
    expect(api).toHaveBeenLastCalledWith("/intake/messages?view=failed&limit=50");
    expect(screen.getByRole("radio", { name: "Failed" })).toBeChecked();
  });

  it("accepts a held mail", async () => {
    const user = userEvent.setup();
    render(<IntakePage />);
    await user.click(await screen.findByRole("button", { name: "Accept and read it" }));
    expect(posts()).toEqual(["/intake/messages/m2/accept"]);
  });

  it("discards a held mail only after asking", async () => {
    const user = userEvent.setup();
    render(<IntakePage />);
    await user.click(await screen.findByRole("button", { name: "Discard…" }));
    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveTextContent("The held copies of its attachments are deleted");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(posts()).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Discard…" }));
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Discard" }));
    expect(posts()).toEqual(["/intake/messages/m2/discard"]);
  });

  it("reads a failed document again, and says the API's refusal word for word", async () => {
    const user = userEvent.setup();
    render(<IntakePage />);
    const failed = (await screen.findByText("blurry.pdf")).closest("li")!;
    expect(within(failed).getByText(/document reading failed/)).toBeInTheDocument();
    await user.click(within(failed).getByRole("button", { name: "Retry" }));
    expect(posts()).toEqual(["/intake/items/i6/retry"]);
    expect(await within(failed).findByText(/document being read again/)).toBeInTheDocument();

    serve((path) => {
      if (path.startsWith("/intake/messages?")) return [HELD];
      throw new ApiError(409, "Nothing is held in this mail.");
    });
    await user.click(screen.getAllByRole("button", { name: "Accept and read it" })[0]);
    expect(await screen.findByText("Nothing is held in this mail.")).toBeInTheDocument();
  });

  it("offers no Accept, Discard or Retry to a reader, nor while an administrator is viewing", async () => {
    who.role = "reader";
    const { unmount } = render(<IntakePage />);
    await screen.findByText("Bills for October");
    expect(screen.queryByRole("button", { name: /Accept|Discard|Retry/ })).toBeNull();
    unmount();

    who.role = "admin";
    who.viewing = true;
    render(<IntakePage />);
    await screen.findByText("Bills for October");
    expect(screen.queryByRole("button", { name: /Accept|Discard|Retry/ })).toBeNull();
  });

  it("says when a view is empty", async () => {
    serve(() => []);
    nav.search = "view=rejected";
    render(<IntakePage />);
    expect(await screen.findByText("No mail was rejected.")).toBeInTheDocument();
  });
});

describe("Documents: where each came in (V2 P5)", () => {
  const PAGE = {
    items: [
      { id: "d1", filename: "emailed.pdf", doc_type: "invoice", status: "processed", stage: "processed", ready_for_chat: false, page_count: 1, created_at: "2026-11-03T06:00:00Z", source: "email" },
      { id: "d2", filename: "uploaded.pdf", doc_type: "invoice", status: "processed", stage: "processed", ready_for_chat: false, page_count: 1, created_at: "2026-11-03T05:00:00Z", source: "upload" },
    ],
    next_before: null,
  };  // prettier-ignore

  beforeEach(() => {
    nav.pathname = "/documents";
    serve(() => PAGE);
  });

  it("marks emailed documents and links to the mail received", async () => {
    render(<DocumentsPage />);
    const emailed = (await screen.findByRole("link", { name: "emailed.pdf" })).closest("tr")!;
    expect(within(emailed).getByText("Email")).toBeInTheDocument();
    const uploaded = screen.getByRole("link", { name: "uploaded.pdf" }).closest("tr")!;
    expect(within(uploaded).queryByText("Email")).toBeNull();
    expect(screen.getByRole("link", { name: "Mail received" })).toHaveAttribute("href", "/intake");
    expect(api).toHaveBeenCalledWith("/documents?limit=50");
  });

  it("filters by source, passed to the list", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<DocumentsPage />);
    await screen.findByRole("link", { name: "emailed.pdf" });
    const source = screen.getByRole("radiogroup", { name: "Came in by" });
    await user.click(within(source).getByRole("radio", { name: "Email" }));
    expect(nav.replace).toHaveBeenCalledWith("/documents?source=email");
    unmount();

    nav.search = "source=email";
    render(<DocumentsPage />);
    await screen.findByRole("link", { name: "emailed.pdf" });
    expect(api).toHaveBeenLastCalledWith("/documents?limit=50&source=email");
    expect(within(screen.getByRole("radiogroup", { name: "Came in by" })).getByRole("radio", { name: "Email" })).toBeChecked();
  });
});
