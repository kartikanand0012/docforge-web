import { describe, expect, it } from "vitest";
import { classify, queueSummary } from "@/lib/reasons";

describe("why a person is needed", () => {
  it("names each of the backend's reasons the way the design does", () => {
    expect(classify("2 checks failed: totals_sum, gst_split")).toEqual({
      kind: "fail", label: "Check failed", text: "2 checks failed: totals_sum, gst_split",
    });
    expect(classify("1 value was not found in the source text it cites").label).toBe("Uncertain value");
    expect(classify("3 values could not be read").label).toBe("Uncertain value");
    expect(classify("it does not match its purchase order")).toEqual({
      kind: "fail", label: "Does not match its order", text: "It does not match its purchase order",
    });
    expect(classify("there is no purchase order on file to compare it with")).toMatchObject({ kind: "info", label: "Not linked yet" });
    expect(classify("the certificate for batch AMX-1 has results outside their limits").label).toBe("Check failed");
    expect(classify("the certificate for batch AMX-1 could not be fully checked").label).toBe("Uncertain value");
  });

  it("sums the queue up in one line", () => {
    const items = [
      { reasons: ["1 check failed: totals_sum", "it does not match its purchase order"] },
      { reasons: ["2 values could not be read"] },
      { reasons: ["1 check failed: gst_split"] },
    ];
    expect(queueSummary(items)).toBe(
      "3 documents need a person, oldest first · 2 failed checks, 1 uncertain value, 1 order mismatch",
    );
    expect(queueSummary([{ reasons: [] }])).toBe("1 document needs a person, oldest first");
  });
});
