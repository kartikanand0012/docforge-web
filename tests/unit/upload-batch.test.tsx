import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => vi.fn());
const upload = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({
  api,
  upload,
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
vi.mock("@/components/Shell", () => ({ useViewing: () => false }));
vi.mock("@/lib/useLiveStages", () => ({ useLiveStages: () => ({}) }));

import UploadPage from "@/app/(app)/upload/page";

const pdf = (name: string) => new File(["%PDF-1.4 x"], name, { type: "application/pdf" });
const counts = { total: 2, not_sent: 0, received: 2, already_received: 0, refused: 0, waiting: 2, processed: 0, ready: 0, split: 0, failed: 0 };

beforeEach(() => {
  api.mockReset();
  upload.mockReset();
});

describe("uploading many files", () => {
  it("sends files dropped together into one batch, each on its own, and links the batch view", async () => {
    api.mockResolvedValue({ id: "b1", counts, items: [] });
    upload.mockImplementation(async (path: string, form: FormData) => ({
      status: 201,
      body: { id: "i", position: 0, filename: (form.get("file") as File).name, size_bytes: 1, outcome: "received", reason: null, document_id: "d", state: "waiting", error: null },
    }));  // prettier-ignore
    const user = userEvent.setup();
    render(<UploadPage />);

    await user.upload(screen.getByLabelText(/Drop files here/), [pdf("a.pdf"), pdf("b.pdf"), pdf("c.pdf")]);

    expect(api).toHaveBeenCalledWith("/batches", { method: "POST", json: { files: 3, doc_type: "invoice" } });
    expect(await screen.findByRole("link", { name: "Batch view: 3 files" })).toHaveAttribute("href", "/batches/b1");
    expect(upload.mock.calls.map((call) => call[0])).toEqual(["/batches/b1/files", "/batches/b1/files", "/batches/b1/files"]);
  });

  it("sends a ZIP whole and says what was in it", async () => {
    upload.mockResolvedValue({ status: 201, body: { id: "b2", counts: { ...counts, total: 12, received: 10, already_received: 1, refused: 1 }, items: [] } });
    const user = userEvent.setup();
    render(<UploadPage />);

    await user.upload(screen.getByLabelText(/Drop files here/), new File(["PK"], "week-44.zip", { type: "application/zip" }));

    expect(upload).toHaveBeenCalledWith("/batches/zip", expect.any(FormData), expect.any(Function));
    expect(await screen.findByText("12 files: 10 new, 1 already here, 1 refused.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open batch" })).toHaveAttribute("href", "/batches/b2");
  });

  it("points 63 files at once to a ZIP and sends nothing", async () => {
    const user = userEvent.setup();
    render(<UploadPage />);

    await user.upload(screen.getByLabelText(/Drop files here/), Array.from({ length: 63 }, (_, n) => pdf(`${n}.pdf`)));

    expect(screen.getByText(/Up to 50 files can be dropped at once/)).toBeInTheDocument();
    expect(api).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });

  it("still sends one file as a plain upload", async () => {
    upload.mockResolvedValue({ status: 202, body: { created: true, document: { id: "d1", stage: "stored" } } });
    const user = userEvent.setup();
    render(<UploadPage />);

    await user.upload(screen.getByLabelText(/Drop files here/), pdf("one.pdf"));

    expect(upload).toHaveBeenCalledWith("/documents", expect.any(FormData), expect.any(Function));
    expect(api).not.toHaveBeenCalled();
  });
});
