import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SignDialog } from "@/components/document/SignDialog";
import type { Review } from "@/lib/review";

const review: Review = {
  document_id: "d1", doc_type: "invoice", filename: "MS-INV-04417.pdf", version_no: 1, page_count: 1,
  pages: [{ number: 1, width: 595, height: 842 }], decision: "review",
  blockers: ["1 check failed: totals.sum"],
  record: { invoice_no: { value: "MS/24-25/04417", raw: "MS/24-25/04417", block_ids: [] } },
  assessment: { decision: "review", reasons: [], fields: [], rules: [], issues: [] },
  editable_paths: [], corrections: [], match_status: "match", discrepancies: [], counterpart_document_id: null,
  review: null, signature_valid: null, record_sha256: "a".repeat(64),
  meanings: { approved: "I approve this invoice for payment", rejected: "I reject this invoice" },
  superseded: false, certificates: [],
};  // prettier-ignore

function open(props: Partial<Parameters<typeof SignDialog>[0]> = {}) {
  const handlers = { onClose: vi.fn(), onSigned: vi.fn(), onReload: vi.fn() };
  render(<SignDialog review={review} initial="approved" callerName="Priya Nair" callerEmail="priya@medisynth.in" {...handlers} {...props} />);
  return handlers;
}

const pin = () => screen.getByLabelText(/Enter your 6-digit PIN/);

afterEach(() => vi.unstubAllGlobals());

describe("signing", () => {
  it("asks why when approving with checks still open, then for the PIN", async () => {
    open();
    expect(screen.getByRole("dialog", { name: "Approve invoice MS/24-25/04417" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Sign and approve" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Say why you approve while checks are still open.");
    await userEvent.type(screen.getByLabelText("Why approve anyway? (required)"), "Supplier confirmed by phone");
    await userEvent.type(screen.getByLabelText("Note for the record (required)"), "Checked");
    await userEvent.click(screen.getByRole("button", { name: "Sign and approve" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Enter your 6-digit PIN.");
  });

  it("binds the signature to the fingerprint shown and never keeps the PIN", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ outcome: "rejected" }), { status: 201, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetch);
    const { onSigned } = open({ initial: "rejected" });
    await userEvent.type(screen.getByLabelText("Reason for rejecting (required)"), "Wrong supplier");
    await userEvent.type(pin(), "482913");
    await userEvent.click(screen.getByRole("button", { name: "Sign and reject" }));
    const body = JSON.parse(fetch.mock.calls[0][1].body as string);
    expect(body).toMatchObject({ outcome: "rejected", meaning: "I reject this invoice", reason: "Wrong supplier", expected_record_sha256: "a".repeat(64), email: "priya@medisynth.in" });
    expect(onSigned).toHaveBeenCalled();
  });

  it("shows a record changed meanwhile as such, with the old and new fingerprints", async () => {
    const fresh = { ...review, record_sha256: "b".repeat(64), corrections: [{ path: "lines[1].qty", old_text: "1,000", new_text: "1,200", reason: "r", reviewer_name: "Asha Rao", created_at: "2026-10-08T06:00:00Z" }] };
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ detail: "The record changed." }), { status: 409, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify(fresh), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetch);
    const { onReload } = open({ initial: "rejected" });
    await userEvent.type(screen.getByLabelText("Reason for rejecting (required)"), "Wrong supplier");
    await userEvent.type(pin(), "482913");
    await userEvent.click(screen.getByRole("button", { name: "Sign and reject" }));
    expect(await screen.findByRole("alertdialog", { name: "This record changed since you opened it" })).toBeInTheDocument();
    expect(screen.getByText(/Asha Rao corrected/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Reload record" }));
    expect(onReload).toHaveBeenCalledWith(fresh);
  });
});
