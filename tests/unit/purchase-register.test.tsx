import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const saveFile = vi.hoisted(() => vi.fn());
vi.mock("@/lib/exports", async (original) => ({ ...(await original<typeof import("@/lib/exports")>()), saveFile }));

import { PurchaseRegister } from "@/components/exports/PurchaseRegister";
import type { Register, TwoBCheck } from "@/lib/register";

const COLUMNS = [
  "Supplier GSTIN", "Supplier Name", "Invoice Number", "Invoice Date", "Place of Supply (code)", "Taxable Value", "CGST", "SGST", "IGST",
  "Total Tax", "Invoice Total", "Reverse Charge", "ITC Eligibility Note",
];  // prettier-ignore
const EXCLUDED = "Credit and debit notes are not included: DocForge does not read them yet.";
const NOTE_HELP =
  "ITC Eligibility Note: data flags from DocForge's checks, for you to decide on. It is not a judgement of eligibility for input tax credit and not tax advice.";
const CHECK_NOTE =
  "A comparison with the GSTR-2B file you uploaded, by supplier GSTIN and invoice number, each amount within 1 rupee. Not a reconciliation with the GST portal.";
const EMPTY = "No approved invoice is dated in November 2026, so there is no register to make: approve the month's bills first, or choose another month.";

const row = (n: number, extra: Partial<Register["rows"][number]> = {}): Register["rows"][number] => ({
  document_id: `d${n}`, supplier_gstin: "27AAACA1234A1Z5", supplier_name: `Supplier ${n}`, invoice_no: `INV-${n}`, invoice_date: "2026-11-05",
  place_of_supply: "27", taxable_value: "1000.00", cgst: "60.00", sgst: "60.00", igst: "0.00", total_tax: "120.00", invoice_total: "1120.00",
  note: "", ...extra,
});  // prettier-ignore

const REGISTER: Register = {
  month: "2026-11", supplier_gstin: null, invoices: 3, columns: COLUMNS, excluded: EXCLUDED, note_help: NOTE_HELP,
  totals: { taxable_value: "123456.50", cgst: "180.00", sgst: "180.00", igst: "0.00", total_tax: "360.00", invoice_total: "123816.50" },
  rows: [row(1), row(2, { note: "Possible duplicate" }), row(3)],
};  // prettier-ignore

const TWOB = { supplier_gstin: "27AAACA1234A1Z5", trade_name: "Shah", invoice_date: "2026-11-05", invoice_value: "1120.00", taxable_value: "1000.00", cgst: "60.00", sgst: "60.00", igst: "0.00" };  // prettier-ignore
const CHECK: TwoBCheck = {
  month: "2026-11", matched: 1, amount_differs: 1, docforge_only: 1, twob_only: 1, note: CHECK_NOTE,
  rows: [
    { status: "matched", document_id: "d1", twob: { ...TWOB, invoice_no: "INV-1" }, differences: {} },
    { status: "amount_differs", document_id: "d2", twob: { ...TWOB, invoice_no: "INV-2" }, differences: { taxable_value: "250.00", cgst: "-15.00" } },
    { status: "docforge_only", document_id: "d3", twob: null, differences: {} },
  ],
  twob_only_invoices: [{ ...TWOB, supplier_gstin: "24AAACB9999B1Z1", trade_name: "Patel Distributors", invoice_no: "PD-88", invoice_value: "5900.00" }],
};  // prettier-ignore

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const fetchSpy = vi.fn<typeof fetch>();
type Route = (url: string, init: RequestInit) => Response | undefined;
function serve(route: Route) {
  fetchSpy.mockImplementation(async (input, init) => route(String(input), init ?? {}) ?? json(404, { detail: "Not found." }));
}
const calls = (part: string) => fetchSpy.mock.calls.filter(([url]) => String(url).includes(part));

beforeEach(() => {
  fetchSpy.mockReset();
  saveFile.mockReset();
  vi.stubGlobal("fetch", fetchSpy);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const NOW = new Date("2026-11-03T06:00:00Z");

describe("the purchase register on the Exports screen (V2 P4)", () => {
  it("opens on this month in India, even when it is still last month in UTC", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-31T19:00:00Z")); // 00:30 on 1 Nov in India
    serve(() => json(200, REGISTER));
    render(<PurchaseRegister />);
    expect(await screen.findByText(EXCLUDED)).toBeInTheDocument();
    expect(fetchSpy.mock.calls[0][0]).toBe("/api/v1/exports/purchase-register?month=2026-11");
    expect(screen.getByLabelText("Month")).toHaveValue("2026-11");
  });

  it("shows the count and the totals the file holds, the rows under its headers, and what is left out", async () => {
    serve(() => json(200, REGISTER));
    render(<PurchaseRegister now={NOW} />);
    expect(await screen.findByText("3 invoices")).toBeInTheDocument();
    expect(screen.getByText(/These totals match the file\./)).toBeInTheDocument();
    const totals = screen.getByRole("list", { name: "Totals" });
    expect(within(totals).getByText("Taxable value").nextSibling).toHaveTextContent("₹1,23,456.50");
    expect(within(totals).getByText("Invoice total").nextSibling).toHaveTextContent("₹1,23,816.50");
    expect(within(totals).getByText("Total tax").nextSibling).toHaveTextContent("₹360.00");

    const table = screen.getByRole("table", { name: /Purchase register for November 2026/ });
    const headers = within(table).getAllByRole("columnheader").map((th) => th.textContent);
    expect(headers).toEqual(COLUMNS);
    expect(within(table).getAllByText("05-Nov-2026")).toHaveLength(3);
    expect(within(table).getAllByText("₹1,000.00")).toHaveLength(3);
    expect(within(table).getByText("Possible duplicate")).toBeInTheDocument();
    expect(screen.getByText(EXCLUDED)).toBeInTheDocument();
    expect(screen.getByText(NOTE_HELP)).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: "ITC Eligibility Note" })).toHaveAccessibleDescription(NOTE_HELP);
    expect(screen.getByRole("button", { name: "Download Excel" })).toBeInTheDocument();
  });

  it("asks again for another month and one supplier", async () => {
    serve(() => json(200, REGISTER));
    render(<PurchaseRegister now={NOW} />);
    await screen.findByText("3 invoices");
    await userEvent.clear(screen.getByLabelText("Month"));
    await userEvent.type(screen.getByLabelText("Month"), "2026-10");
    await userEvent.type(screen.getByLabelText("Supplier GSTIN (optional)"), "27aaaca1234a1z5");
    await userEvent.click(screen.getByRole("button", { name: "Show register" }));
    expect(fetchSpy.mock.calls.at(-1)![0]).toBe("/api/v1/exports/purchase-register?month=2026-10&supplier_gstin=27AAACA1234A1Z5");
  });

  it("says why there is no register for an empty month, with no download button", async () => {
    serve(() => json(200, { ...REGISTER, invoices: 0, rows: [], totals: { ...REGISTER.totals, taxable_value: "0" } }));
    render(<PurchaseRegister now={NOW} />);
    expect(await screen.findByText(EMPTY)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Download Excel" })).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("shows the API's sentence when the file is refused as empty (422 register_empty), and takes the button away", async () => {
    const sentence = "No approved invoice is dated in November 2026, so there is no register to make: approve the month's bills first.";
    serve((url) => (url.endsWith("/file") ? json(422, { detail: sentence, code: "register_empty" }) : json(200, REGISTER)));
    render(<PurchaseRegister now={NOW} />);
    await userEvent.click(await screen.findByRole("button", { name: "Download Excel" }));
    expect(await screen.findByText(sentence)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Download Excel" })).toBeNull();
    expect(saveFile).not.toHaveBeenCalled();
  });

  it("downloads the file under the API's name", async () => {
    serve((url) =>
      url.endsWith("/file")
        ? new Response(new Blob(["xlsx"]), { status: 200, headers: { "content-disposition": 'attachment; filename="docforge-purchase-register-2026-11.xlsx"' } })
        : json(200, REGISTER),
    );
    render(<PurchaseRegister now={NOW} />);
    expect(await screen.findByText(/Choose a GSTR-2B file above to add a “2B check” sheet/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Download Excel" }));
    await vi.waitFor(() => expect(saveFile).toHaveBeenCalledTimes(1));
    expect(saveFile.mock.calls[0][1]).toBe("docforge-purchase-register-2026-11.xlsx");
    const form = calls("/file")[0][1]!.body as FormData;
    expect(form.get("month")).toBe("2026-11");
    expect(form.get("gstr2b")).toBeNull();
  });

  it("marks each row against the 2B file, lists the 2B-only invoices, and puts the 2B file in the download", async () => {
    serve((url) => {
      if (url.endsWith("/2b-check")) return json(200, CHECK);
      if (url.endsWith("/file")) return new Response(new Blob(["xlsx"]), { status: 200, headers: { "content-disposition": 'attachment; filename="r.xlsx"' } });
      return json(200, REGISTER);
    });
    render(<PurchaseRegister now={NOW} />);
    await screen.findByText("3 invoices");
    const twob = new File(["{}"], "gstr2b-nov-2026.json", { type: "application/json" });
    await userEvent.upload(screen.getByLabelText("GSTR-2B file"), twob);

    const check = calls("/2b-check")[0][1]!.body as FormData;
    expect((check.get("file") as File).name).toBe("gstr2b-nov-2026.json");
    expect(check.get("month")).toBe("2026-11");

    expect(await screen.findByText(CHECK_NOTE)).toBeInTheDocument();
    const summary = screen.getByRole("group", { name: "2B check summary" });
    expect(summary).toHaveTextContent("Matched: 1");
    expect(summary).toHaveTextContent("Amount differs: 1");
    expect(summary).toHaveTextContent("In DocForge only: 1");
    expect(summary).toHaveTextContent("In 2B only: 1");

    const table = screen.getByRole("table", { name: /Purchase register/ });
    const [first, second, third] = within(table).getAllByRole("row").slice(1);
    expect(within(first).getByText("Matched")).toBeInTheDocument();
    expect(within(second).getByText("Amount differs")).toBeInTheDocument();
    expect(within(second).getByText("Taxable value ₹250.00 more in DocForge")).toBeInTheDocument();
    expect(within(second).getByText("CGST ₹15.00 more in 2B")).toBeInTheDocument();
    expect(within(third).getByText("In DocForge only")).toBeInTheDocument();

    const only = screen.getByRole("table", { name: "In 2B only" });
    expect(within(only).getByText("PD-88")).toBeInTheDocument();
    expect(within(only).getByText("Patel Distributors")).toBeInTheDocument();
    expect(within(only).getByText("₹5,900.00")).toBeInTheDocument();

    expect(screen.getByText("The file includes a “2B check” sheet from gstr2b-nov-2026.json.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Download Excel" }));
    await vi.waitFor(() => expect(saveFile).toHaveBeenCalledTimes(1));
    const form = calls("/file")[0][1]!.body as FormData;
    expect((form.get("gstr2b") as File).name).toBe("gstr2b-nov-2026.json");
  });

  it("sets aside a 2B file the API cannot read, saying why", async () => {
    serve((url) => (url.endsWith("/2b-check") ? json(422, { detail: "That file is not a GSTR-2B download." }) : json(200, REGISTER)));
    render(<PurchaseRegister now={NOW} />);
    await screen.findByText("3 invoices");
    await userEvent.upload(screen.getByLabelText("GSTR-2B file"), new File(["x"], "other.xlsx"));
    expect(await screen.findByText("That file is not a GSTR-2B download.")).toBeInTheDocument();
    expect(screen.getByText(/Choose a GSTR-2B file above/)).toBeInTheDocument();
  });
});
