import { describe, expect, it } from "vitest";
import { marked } from "@/lib/search";

describe("matched words", () => {
  it("are marked wherever they appear, whatever their case, and nothing else is", () => {
    expect(marked("Batch AMX-2409 shipped; batch AMX-2410 held.", "batch amx-2409")).toEqual([
      { text: "Batch", match: true }, { text: " ", match: false }, { text: "AMX-2409", match: true },
      { text: " shipped; ", match: false }, { text: "batch", match: true }, { text: " AMX-2410 held.", match: false },
    ]);
  });

  it("treat a query's special characters as plain text", () => {
    expect(marked("Total (incl. GST) 1,180.00", "(incl.")).toEqual([
      { text: "Total ", match: false }, { text: "(incl.", match: true }, { text: " GST) 1,180.00", match: false },
    ]);
    expect(marked("no words here", "  ")).toEqual([{ text: "no words here", match: false }]);
  });
});
