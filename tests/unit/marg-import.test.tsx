import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({
  api,
  apiUrl: (path: string) => `/api/v1${path}`,
  errorFrom: (status: number, body: { detail?: string } | null) => Object.assign(new Error(body?.detail ?? "x"), { status, detail: body?.detail ?? "x" }),
  ApiError: class extends Error {
    constructor(
      readonly status: number,
      readonly detail: string,
      readonly retryAfter: number | null = null,
      readonly fields: string[] = [],
      readonly existingId: string | null = null,
      readonly code: string | null = null,
    ) {
      super(detail);
    }
  },
}));

import { Exports } from "@/components/exports/Exports";
import { ApiError } from "@/lib/api";
import type { ExportRun } from "@/lib/exports";
import { NO_PROFILE_MESSAGE, type MargProfile } from "@/lib/profiles";

const NOW = new Date("2026-10-27T06:00:00Z");
const EXACT =
  "We need one purchase import file your Marg accepted. Your dealer or your last supplier import will have one. Upload it in Settings > Marg profile and we will match it.";

const profile = (sample: boolean, active = true): MargProfile => ({
  id: "p1", target: "marg", name: sample ? "SAMPLE (made-up layout, not a Marg format)" : "Shah Medicals", active,
  latest: { id: "v3", version_no: 3, basis: sample ? "sample" : "upload", sample, spec: {} as never, created_by: "Asha", created_at: "2026-10-20T06:00:00Z" },
  created_by: "Asha", created_at: "2026-10-20T06:00:00Z", updated_by: null, updated_at: null,
});  // prettier-ignore

const run = (overrides: Partial<ExportRun> = {}): ExportRun => ({
  id: "r1", target: "marg", format: "marg_import", from: "2026-10-01", to: "2026-10-27", status: "ready", invoices: 20, lines: 64, tasks: null,
  file: { filename: "marg-purchase-2026-10-01-2026-10-27.xlsx", sha256: "a".repeat(64), size_bytes: 4096 },
  profile: { version_id: "v3", profile_id: "p1", name: "Shah Medicals", version_no: 3, sample: false }, overlaps: [],
  created_by: "Asha", created_at: "2026-10-27T06:00:00Z", ...overrides,
});  // prettier-ignore

type Handler = (path: string, init?: { method?: string; json?: unknown }) => unknown;
function serve(handler: Handler) {
  api.mockImplementation((path: string, init?: { method?: string; json?: unknown }) => {
    try {
      return Promise.resolve(handler(path, init));
    } catch (error) {
      return Promise.reject(error);
    }
  });
}
const posts = () => api.mock.calls.filter(([, init]) => init?.method === "POST");

beforeEach(() => api.mockReset());

describe("a Marg purchase import from the Exports screen (V2 P3)", () => {
  it("has the message word for word", () => {
    expect(NO_PROFILE_MESSAGE).toBe(EXACT);
  });

  it("without an active Marg profile, shows the way to one instead of a run button", async () => {
    serve((path) => (path === "/settings/export-profiles" ? [profile(false, false)] : []));
    render(<Exports mayMap now={NOW} />);
    expect(screen.getByRole("button", { name: "Run export" })).toBeInTheDocument(); // Tally, by default
    await userEvent.click(screen.getByRole("radio", { name: "Marg purchase import" }));

    expect(await screen.findByText(EXACT)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Run export|Running/ })).toBeNull();
    expect(screen.getByRole("link", { name: "Open Settings › Marg profile" })).toHaveAttribute("href", "/settings/marg-profile");
    expect(posts()).toHaveLength(0);

    // Back to Marg's mapped CSV: the button again, and no message.
    await userEvent.click(screen.getByRole("radio", { name: "Marg" }));
    expect(screen.getByRole("button", { name: "Run export" })).toBeInTheDocument();
    expect(screen.queryByText(EXACT)).toBeNull();
  });

  it("shows the same message when the API says there is no active profile (409 no_active_profile)", async () => {
    serve((path, init) => {
      if (init?.method === "POST") throw new ApiError(409, "No active Marg profile.", null, [], null, "no_active_profile");
      return path === "/settings/export-profiles" ? [profile(false)] : [];
    });
    render(<Exports mayMap now={NOW} />);
    await userEvent.click(screen.getByRole("radio", { name: "Marg purchase import" }));
    await userEvent.click(await screen.findByRole("button", { name: "Run export" }));
    expect(posts()[0]).toEqual(["/exports/runs", { method: "POST", json: { target: "marg", from: "2026-10-01", to: "2026-10-27", format: "marg_import" } }]);
    expect(await screen.findByText(EXACT)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Run export" })).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull(); // a way forward, not an error
  });

  it("names the active profile, warns by the button when it is the SAMPLE, and on the run made with it", async () => {
    serve((path, init) => {
      if (init?.method === "POST") return run({ profile: { version_id: "v3", profile_id: "p1", name: "SAMPLE (made-up layout, not a Marg format)", version_no: 3, sample: true } });
      return path === "/settings/export-profiles" ? [profile(true)] : [];
    });
    render(<Exports mayMap now={NOW} />);
    await userEvent.click(screen.getByRole("radio", { name: "Marg purchase import" }));
    const form = screen.getByRole("form", { name: "New export" });
    expect(await within(form).findByText("SAMPLE layout — made up, not a Marg format")).toBeInTheDocument();
    expect(form).toHaveTextContent("version 3");

    await userEvent.click(within(form).getByRole("button", { name: "Run export" }));
    const result = await screen.findByRole("region", { name: "This export" });
    expect(within(result).getByText("SAMPLE layout — made up, not a Marg format")).toBeInTheDocument();
    expect(result).toHaveTextContent("Made with the Marg profile ‘SAMPLE (made-up layout, not a Marg format)’, version 3.");
  });

  it("does not warn for a profile made from a file Marg accepted, and says which version the run used", async () => {
    serve((path, init) => (init?.method === "POST" ? run() : path === "/settings/export-profiles" ? [profile(false)] : []));
    render(<Exports mayMap now={NOW} />);
    await userEvent.click(screen.getByRole("radio", { name: "Marg purchase import" }));
    await userEvent.click(await screen.findByRole("button", { name: "Run export" }));
    const result = await screen.findByRole("region", { name: "This export" });
    expect(result).toHaveTextContent("Marg purchase import · bills approved");
    expect(result).toHaveTextContent("Made with the Marg profile ‘Shah Medicals’, version 3.");
    expect(screen.queryByText("SAMPLE layout — made up, not a Marg format")).toBeNull();
  });

  it("lists the checks a bill failed by bill and line, with no file", async () => {
    const tasks = {
      suppliers: [], items: [],
      problems: [
        { document_id: "d1", filename: "nvm-90999.pdf", line: 3, problem: "Invoice NVM/26-27/90999, line 3 has no batch number: correct it on the bill, then export again." },
        { document_id: "d1", filename: "nvm-90999.pdf", line: 5, problem: "Invoice NVM/26-27/90999, line 5 has no expiry: correct it on the bill, then export again." },
        { document_id: "d2", filename: "abc-17.pdf", line: null, problem: "The bill has no invoice date." },
      ],
    };  // prettier-ignore
    serve((path, init) => {
      if (init?.method === "POST") return run({ status: "needs_mapping", file: null, tasks });
      return path === "/settings/export-profiles" ? [profile(false)] : [];
    });
    render(<Exports mayMap now={NOW} />);
    await userEvent.click(screen.getByRole("radio", { name: "Marg purchase import" }));
    await userEvent.click(await screen.findByRole("button", { name: "Run export" }));
    const result = await screen.findByRole("region", { name: "This export" });
    expect(result).toHaveTextContent("2 bills need correcting before this export can be made. No file was made.");
    expect(within(result).queryByRole("button", { name: "Download the file" })).toBeNull();
    expect(result).toHaveTextContent("2 bills to correct first");

    expect(within(result).getByRole("link", { name: "nvm-90999.pdf" })).toHaveAttribute("href", "/documents/d1");
    const lines = within(result).getByRole("list", { name: "What to correct on nvm-90999.pdf" });
    const items = within(lines).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Line 3: Invoice NVM/26-27/90999, line 3 has no batch number");
    expect(items[1]).toHaveTextContent("Line 5: Invoice NVM/26-27/90999, line 5 has no expiry");
    expect(within(result).getByRole("link", { name: "abc-17.pdf" })).toHaveAttribute("href", "/documents/d2");
    expect(result).toHaveTextContent("The bill has no invoice date.");

    // Nothing to map, so it can be run again (in the same format) once the bills are corrected.
    await userEvent.click(within(result).getByRole("button", { name: "Run export again" }));
    expect(posts().at(-1)?.[1]).toEqual({ method: "POST", json: { target: "marg", from: "2026-10-01", to: "2026-10-27", format: "marg_import" } });
  });

  it("warns, one line each, when bills were exported before, and still offers the file", async () => {
    const overlaps = [
      { run_id: "r0", created_at: "2026-10-12T06:00:00Z", format: "mapped_csv" as const, invoices: 12 },
      { run_id: "r9", created_at: "2026-10-20T06:00:00Z", format: "marg_import" as const, invoices: 1 },
    ];
    serve((path, init) => (init?.method === "POST" ? run({ overlaps }) : path === "/settings/export-profiles" ? [profile(false)] : []));
    render(<Exports mayMap now={NOW} />);
    await userEvent.click(screen.getByRole("radio", { name: "Marg purchase import" }));
    await userEvent.click(await screen.findByRole("button", { name: "Run export" }));
    const result = await screen.findByRole("region", { name: "This export" });
    const warning = within(result).getByText("12 of these bills were already in the export of 12 Oct 2026.");
    expect(warning.closest(".alert")).toHaveClass("alert-warn");
    expect(within(result).getByText("1 of these bills was already in the Marg purchase import of 20 Oct 2026.")).toBeInTheDocument();
    expect(within(result).queryByRole("alert")).toBeNull();
    expect(within(result).getByRole("button", { name: "Download the file" })).toBeInTheDocument();
  });

  it("marks past runs made with the SAMPLE layout", async () => {
    serve((path) =>
      path === "/exports/runs"
        ? [run({ id: "r5", profile: { version_id: "v1", profile_id: "p9", name: "Trial", version_no: 1, sample: true } }), run({ id: "r4", format: "mapped_csv", profile: null })]
        : [],
    );
    render(<Exports mayMap now={NOW} />);
    const table = await screen.findByRole("table", { name: "Past exports" });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows[0]).toHaveTextContent("Marg purchase import");
    expect(rows[0]).toHaveTextContent("‘Trial’, version 1");
    expect(within(rows[0]).getByText("SAMPLE layout — made up, not a Marg format")).toBeInTheDocument();
    expect(rows[1]).not.toHaveTextContent("SAMPLE");
  });
});
