import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import {
  cellOf, checkTwoB, differenceWords, differencesOf, emptySentence, fetchRegisterFile, getRegister, indiaMonth, monthWords, registerDay,
  type RegisterRow,
} from "@/lib/register";  // prettier-ignore

const fetchSpy = vi.fn<typeof fetch>();
beforeEach(() => {
  fetchSpy.mockReset();
  vi.stubGlobal("fetch", fetchSpy);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const sent = (call = 0) => ({ url: fetchSpy.mock.calls[call][0] as string, init: fetchSpy.mock.calls[call][1]! });

const EMPTY = "No approved invoice is dated in November 2026, so there is no register to make: approve the month's bills first, or choose another month.";

describe("the purchase register API, through the app's proxy (V2 P4)", () => {
  it("previews a month, with a supplier only when one is given", async () => {
    fetchSpy.mockImplementation(async () => json(200, {}));
    await getRegister("2026-11");
    await getRegister("2026-11", "  27AAACA1234A1Z5 ");
    await getRegister("2026-11", "");
    expect(fetchSpy.mock.calls.map(([url]) => url)).toEqual([
      "/api/v1/exports/purchase-register?month=2026-11",
      "/api/v1/exports/purchase-register?month=2026-11&supplier_gstin=27AAACA1234A1Z5",
      "/api/v1/exports/purchase-register?month=2026-11",
    ]);
  });

  it("asks for the file as multipart, with the 2B download when one was chosen, and saves it under the API's name", async () => {
    fetchSpy.mockImplementation(
      async () =>
        new Response(new Blob(["xlsx"]), { status: 200, headers: { "content-disposition": 'attachment; filename="docforge-purchase-register-2026-11.xlsx"' } }),
    );
    const twob = new File(["{}"], "gstr2b-nov.json", { type: "application/json" });
    const result = await fetchRegisterFile("2026-11", "27AAACA1234A1Z5", twob);
    expect(result).toMatchObject({ kind: "file", filename: "docforge-purchase-register-2026-11.xlsx" });
    expect(sent().url).toBe("/api/v1/exports/purchase-register/file");
    expect(sent().init.method).toBe("POST");
    expect(sent().init.headers).toBeUndefined(); // the browser sets the boundary
    const form = sent().init.body as FormData;
    expect(form.get("month")).toBe("2026-11");
    expect(form.get("supplier_gstin")).toBe("27AAACA1234A1Z5");
    expect((form.get("gstr2b") as File).name).toBe("gstr2b-nov.json");

    await fetchRegisterFile("2026-11");
    const plain = sent(1).init.body as FormData;
    expect([...plain.keys()]).toEqual(["month"]);
  });

  it("turns 422 register_empty into an empty state with the API's sentence; any other refusal is thrown", async () => {
    fetchSpy.mockResolvedValueOnce(json(422, { detail: EMPTY, code: "register_empty" }));
    expect(await fetchRegisterFile("2026-11")).toEqual({ kind: "empty", detail: EMPTY });

    fetchSpy.mockResolvedValueOnce(json(422, { detail: "That file is not a GSTR-2B download." }));
    const refused = await fetchRegisterFile("2026-11", null, new File(["x"], "x.xlsx")).catch((e: unknown) => e);
    expect(refused).toBeInstanceOf(ApiError);
    expect((refused as ApiError).detail).toBe("That file is not a GSTR-2B download.");
  });

  it("sends a 2B download to compare as multipart", async () => {
    fetchSpy.mockResolvedValue(json(200, { rows: [] }));
    await checkTwoB(new File(["x"], "2b.xlsx"), "2026-11", "27AAACA1234A1Z5");
    expect(sent().url).toBe("/api/v1/exports/purchase-register/2b-check");
    expect(sent().init.method).toBe("POST");
    const form = sent().init.body as FormData;
    expect(form.get("month")).toBe("2026-11");
    expect(form.get("supplier_gstin")).toBe("27AAACA1234A1Z5");
    expect((form.get("file") as File).name).toBe("2b.xlsx");
  });
});

describe("the register's words", () => {
  it("takes this month in India, not the browser's UTC month", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-31T19:00:00Z")); // 00:30 on 1 Nov in India
    expect(indiaMonth()).toBe("2026-11");
    expect(indiaMonth(new Date("2026-10-31T18:00:00Z"))).toBe("2026-10"); // 23:30 on 31 Oct
  });

  it("says months and days as the file does", () => {
    expect(monthWords("2026-11")).toBe("November 2026");
    expect(registerDay("2026-11-05")).toBe("05-Nov-2026");
    expect(registerDay(null)).toBe("—");
    expect(emptySentence("2026-11", null)).toBe(EMPTY);
    expect(emptySentence("2026-11", "27AAACA1234A1Z5")).toContain("No approved invoice from 27AAACA1234A1Z5 is dated in November 2026");
  });

  it("words a difference as DocForge less 2B, the higher side named", () => {
    expect(differenceWords("taxable_value", "250.00")).toBe("Taxable value ₹250.00 more in DocForge");
    expect(differenceWords("cgst", "-45.5")).toBe("CGST ₹45.50 more in 2B");
    expect(differenceWords("invoice_total", "-123456.7")).toBe("Invoice total ₹1,23,456.70 more in 2B");
    expect(differencesOf({ differences: { igst: "10", taxable_value: "-2" } })).toEqual(["Taxable value ₹2.00 more in 2B", "IGST ₹10.00 more in DocForge"]);
  });

  it("fills each of the file's columns, the Reverse Charge left blank", () => {
    const row: RegisterRow = {
      document_id: "d1", supplier_gstin: "27AAACA1234A1Z5", supplier_name: "Shah Pharma", invoice_no: "INV-7", invoice_date: "2026-11-03",
      place_of_supply: "27", taxable_value: "123456.5", cgst: "11111.08", sgst: "11111.08", igst: "0", total_tax: "22222.16",
      invoice_total: "145678.66", note: "Possible duplicate",
    };  // prettier-ignore
    expect(cellOf("Invoice Date", row)).toBe("03-Nov-2026");
    expect(cellOf("Taxable Value", row)).toBe("₹1,23,456.50");
    expect(cellOf("IGST", row)).toBe("₹0.00");
    expect(cellOf("Reverse Charge", row)).toBe("");
    expect(cellOf("ITC Eligibility Note", row)).toBe("Possible duplicate");
    expect(cellOf("Unknown", row)).toBe("");
  });
});
