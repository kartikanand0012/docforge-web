import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const saveFile = vi.hoisted(() => vi.fn());
vi.mock("@/lib/exports", async (original) => ({ ...(await original<typeof import("@/lib/exports")>()), saveFile }));

import { VariancePanel } from "@/components/document/VariancePanel";
import { PoVarianceReport } from "@/components/exports/PoVarianceReport";
import { differenceWords, linesMatched, signedMoney, type Variance, type VarianceLine, type VarianceReport } from "@/lib/variance";

const SIGN = "Money impact: a positive amount is the bill costing more than the PO agreed (or scheme goods short); a negative one, less.";
const TOLERANCES = { rate: "0.00", qty: 0, free_qty: 0, amount: "1.00" };
const clean = (n: number): VarianceLine => ({ line: n, order_line: n, product: `Product ${n}`, clean: true, note: null, differences: [] });

const VARIANCE: Variance = {
  invoice_no: "NVM/9", po_no: "PO-1", supplier_name: "Navjivan Medical Agencies", supplier_gstin: "24AABFN7754K1Z0",
  invoice_total: "23520.00", po_total: "20000.00", net_impact: "2000.00", net_percent: "10.00", above_po: "2000.00",
  lines_checked: 44, lines_matched: 42, variances: 2, not_compared: 0,
  lines: [
    { line: 1, order_line: 1, product: "Amoxicillin Capsules IP 250mg", clean: false, note: null, differences: [
      { field: "rate", label: "Rate", status: "variance", po_value: "100.00", billed_value: "105.00", difference: "5.00", money_impact: "1000.00",
        working: "(105.00 − 100.00) × 200 billed = ₹1,000.00", note: null },
    ] },
    { line: 2, order_line: 2, product: "Cetirizine Tablets IP 10mg", clean: false, note: null, differences: [
      { field: "free_qty", label: "Free Qty", status: "variance", po_value: 10, billed_value: 0, difference: -10, money_impact: "1000.00",
        working: "(10 due − 0 billed) × PTR 100.00 = ₹1,000.00", note: "Scheme 10+1 on 100 billed gives 10 free." },
    ] },
    ...Array.from({ length: 42 }, (_, n) => clean(n + 3)),
  ],
  not_in_po: [{ line: 45, product: "Zinc Tablets 20mg", qty: 50, rate: "12.00", value: "600.00", working: "taxable amount as billed", note: null }],
  not_billed: [{ line: 7, product: "Paracetamol Tablets IP 500mg", qty: 30, rate: "8.50", value: "255.00", working: "30 × 8.50 = ₹255.00", note: null }],
  not_in_po_value: "600.00", not_billed_value: "255.00", tolerances: TOLERANCES, sign_note: SIGN,
};  // prettier-ignore

describe("the document's Variance panel", () => {
  it("shows the differing lines with the money and its arithmetic, and folds the matched ones", () => {
    render(<VariancePanel variance={VARIANCE} />);

    const table = screen.getByRole("table", { name: "Lines that differ" });
    const rate = within(table).getByRole("row", { name: /Amoxicillin/ });
    expect(rate).toHaveTextContent("Rate");
    expect(rate).toHaveTextContent("₹100.00");
    expect(rate).toHaveTextContent("₹105.00");
    expect(rate).toHaveTextContent("+₹1,000.00");
    expect(rate).toHaveTextContent("(105.00 − 100.00) × 200 billed = ₹1,000.00");
    const free = within(table).getByRole("row", { name: /Cetirizine/ });
    expect(free).toHaveTextContent("Free Qty");
    expect(free).toHaveTextContent("−10");
    expect(screen.getByText("42 lines matched")).toBeInTheDocument();
    expect(within(table).queryByText(/Product 3/)).toBeNull();
    expect(screen.getByLabelText("Variance summary")).toHaveTextContent("+₹2,000.00 (+10.00%)");
  });

  it("lists lines on one side only in their own sections", () => {
    render(<VariancePanel variance={VARIANCE} />);

    const notInPo = screen.getByRole("region", { name: /Not in PO/ });
    expect(notInPo).toHaveTextContent("bill line 45: Zinc Tablets 20mg");
    const notBilled = screen.getByRole("region", { name: /Not billed/ });
    expect(notBilled).toHaveTextContent("PO line 7: Paracetamol Tablets IP 500mg · 30 × 8.50 = ₹255.00");
  });

  it("says when every line agrees, with tolerance notes kept under the matched lines", () => {
    const within_tolerance: VarianceLine = {
      ...clean(1),
      differences: [{ field: "rate", label: "Rate", status: "within_tolerance", po_value: "100.00", billed_value: "100.40", difference: "0.40",
        money_impact: null, working: "(100.40 − 100.00) × 200 billed = ₹80.00", note: "Rate differs by 0.40, inside the workspace's tolerance of 1.00." }],
    };  // prettier-ignore
    render(<VariancePanel variance={{ ...VARIANCE, lines: [within_tolerance], not_in_po: [], not_billed: [], net_impact: "0.00", net_percent: "0.00" }} />);

    expect(screen.getByText("No variance")).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByText("1 line matched")).toBeInTheDocument();
    expect(screen.getByText(/inside the workspace's tolerance of 1.00/)).toBeInTheDocument();
  });
});

describe("variance words", () => {
  it("signs rupees and counts as a reader expects", () => {
    expect(signedMoney("1000.00")).toBe("+₹1,000.00");
    expect(signedMoney("-123456.5")).toBe("−₹1,23,456.50");
    expect(signedMoney("0.00")).toBe("₹0.00");
    expect(differenceWords("qty", -10)).toBe("−10");
    expect(differenceWords("rate", "5.00")).toBe("+₹5.00");
    expect(linesMatched(42)).toBe("42 lines matched");
  });
});

const SUPPLIER = {
  supplier_gstin: "24AABFN7754K1Z0", supplier_name: "Navjivan Medical Agencies", invoices_checked: 3, lines_checked: 30, lines_matched: 27,
  variances: 4, not_compared: 0, not_in_po_lines: 1, not_billed_lines: 1, above_po: "4183.60", net_impact: "4183.60",
};  // prettier-ignore
const REPORT: VarianceReport = {
  month: "2026-11", supplier_gstin: null, tolerances: TOLERANCES, totals: { ...SUPPLIER, supplier_gstin: null, supplier_name: null },
  suppliers: [SUPPLIER], invoices: [], sign_note: SIGN,
  not_checked: [
    { document_id: "d9", invoice_no: "NVM/77", invoice_date: "2026-11-05", supplier_gstin: null, supplier_name: "Shah Pharma", reason: "No purchase order linked" },
    { document_id: "d8", invoice_no: "NVM/78", invoice_date: "2026-11-06", supplier_gstin: null, supplier_name: null, reason: "Not approved yet: its values are not confirmed" },
  ],
};  // prettier-ignore

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const fetchSpy = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchSpy.mockReset();
  saveFile.mockReset();
  vi.stubGlobal("fetch", fetchSpy);
});
afterEach(() => vi.unstubAllGlobals());

describe("the PO Variance Report export", () => {
  it("shows the month's number and counts every invoice it could not check, with its reason", async () => {
    fetchSpy.mockResolvedValue(json(200, REPORT));
    render(<PoVarianceReport now={new Date("2026-11-20T10:00:00+05:30")} />);

    const totals = await screen.findByRole("list", { name: "Month's variance" });
    expect(totals).toHaveTextContent("Invoices checked3");
    expect(totals).toHaveTextContent("Charged above PO₹4,183.60");
    expect(screen.getByText("Not checked: 2 invoices")).toBeInTheDocument();
    expect(screen.getByText("No purchase order linked")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "NVM/77" })).toHaveAttribute("href", "/documents/d9");
    expect(String(fetchSpy.mock.calls[0][0])).toContain("/exports/po-variance?month=2026-11");
  });

  it("downloads the Excel file the API makes", async () => {
    fetchSpy.mockImplementation(async (input) =>
      String(input).includes("/file")
        ? new Response(new Blob(["xlsx"]), { status: 200, headers: { "content-disposition": 'attachment; filename="docforge-po-variance-2026-11.xlsx"' } })
        : json(200, REPORT),
    );
    const user = userEvent.setup();
    render(<PoVarianceReport now={new Date("2026-11-20T10:00:00+05:30")} />);

    await user.click(await screen.findByRole("button", { name: "Download PO Variance Report (Excel)" }));

    expect(saveFile).toHaveBeenCalledWith(expect.any(Blob), "docforge-po-variance-2026-11.xlsx");
    const [, init] = fetchSpy.mock.calls.find(([url]) => String(url).includes("/file"))!;
    expect((init?.body as FormData).get("month")).toBe("2026-11");
  });

  it("says so for a month with no invoice, and offers no file", async () => {
    fetchSpy.mockResolvedValue(json(200, { ...REPORT, suppliers: [], not_checked: [] }));
    render(<PoVarianceReport now={new Date("2026-11-20T10:00:00+05:30")} />);

    expect(await screen.findByText("No invoice is dated in November 2026.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Download/ })).toBeNull();
  });
});

describe("the tolerance setting", () => {
  it("sends only the tolerance that changed, in rupees to the paisa", async () => {
    const settings = { near_expiry_months: 6, variance_tolerances: TOLERANCES, updated_by: null, updated_at: null };
    fetchSpy.mockImplementation(async (_input, init) =>
      init?.method === "PATCH" ? json(200, { ...settings, variance_tolerances: { ...TOLERANCES, rate: "1.00" }, updated_by: "Asha Rao" }) : json(200, settings),
    );
    const user = userEvent.setup();
    const { WorkspaceSettings } = await import("@/components/WorkspaceSettings");
    render(<WorkspaceSettings mayChange />);

    const rate = await screen.findByLabelText("Rate (₹ a unit)");
    await user.clear(rate);
    await user.type(rate, "1");
    await user.click(screen.getByRole("button", { name: "Save tolerances" }));

    const [, init] = fetchSpy.mock.calls.find(([, i]) => i?.method === "PATCH")!;
    expect(JSON.parse(String(init?.body))).toEqual({ variance_tolerances: { rate: "1.00" } });
    expect(await screen.findByText(/The variance on every bill and in the report uses them now/)).toBeInTheDocument();
  });

  it("refuses a tolerance that is not a number, in words", async () => {
    fetchSpy.mockResolvedValue(json(200, { near_expiry_months: 6, variance_tolerances: TOLERANCES, updated_by: null, updated_at: null }));
    const user = userEvent.setup();
    const { WorkspaceSettings } = await import("@/components/WorkspaceSettings");
    render(<WorkspaceSettings mayChange />);

    const qty = await screen.findByLabelText("Quantity (units)");
    await user.clear(qty);
    await user.type(qty, "1.5");
    await user.click(screen.getByRole("button", { name: "Save tolerances" }));

    expect(screen.getByText("Quantity (units): enter a whole number, 0 or more.")).toBeInTheDocument();
    expect(fetchSpy.mock.calls.some(([, i]) => i?.method === "PATCH")).toBe(false);
  });
});
