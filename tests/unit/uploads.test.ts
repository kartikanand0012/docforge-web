import { describe, expect, it } from "vitest";
import { clientCheck, refusal } from "@/lib/uploads";

const file = (name: string, size = 1000) => ({ name, size });

describe("before sending", () => {
  it("refuses at once what the server would refuse, in the same words", () => {
    expect(clientCheck(file("invoice.pdf"))).toBeNull();
    expect(clientCheck(file("scan.JPEG"))).toBeNull();
    expect(clientCheck(file("old.xls"))).toBe("Older Office file (.xls). Save it as .xlsx and upload it again.");
    expect(clientCheck(file("notes.txt"))).toBe("This file type is not accepted. Use PDF, DOCX, XLSX, PPTX, PNG, JPEG or TIFF.");
    expect(clientCheck(file("big.pdf", 12 * 1024 * 1024))).toBe("Larger than 10 MB (12.0 MB). Compress it or split it and upload again.");
  });
});

describe("what the server said", () => {
  it("is turned into what to do next", () => {
    expect(refusal(422, "The PDF is protected by a password. Remove the password, or print it to a new PDF, and upload that.", file("a.pdf")).text).toBe(
      "Protected by a password. Remove the password and upload it again.",
    );
    expect(refusal(422, "The file could not be read as a PDF.", file("a.pdf")).text).toBe("The file could not be read as a PDF.");
    expect(refusal(415, "This is an older Office file (.doc, .xls or .ppt) or one protected by a password. ...", file("q.docx")).text).toBe(
      "Older Office file, or one protected by a password. Save it as .docx without a password, or as a PDF, and upload it again.",
    );
    expect(refusal(413, "The document has 34 pages; the limit is 20.", file("a.pdf")).text).toBe("Has 34 pages; the limit is 20. Split it and upload the parts.");
    expect(refusal(413, "The file is larger than the limit of 10485760 bytes.", file("a.pdf", 11_000_000)).text).toBe(
      "Larger than 10 MB (10.5 MB). Compress it or split it and upload again.",
    );
    expect(refusal(409, "This file is already stored as document type 'purchase_order'.", file("a.pdf")).text).toBe("This file is already stored as an order.");
    expect(refusal(503, "The processing queue is full. Try again later.", file("a.pdf"))).toEqual({
      kind: "warn", word: "Not sent", text: "The reading queue is full right now. Nothing was stored; try again in a minute.", retry: true,
    });
    expect(refusal(503, "Storage is unavailable. Try again later.", file("a.pdf")).text).toBe("Storage is unavailable right now. Nothing was stored; try again in a minute.");
  });
});
