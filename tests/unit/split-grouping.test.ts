import { describe, expect, it } from "vitest";
import { MAX_FILES, isZip, itemWords, planDrop, pool, reconciles, type BatchItem } from "@/lib/batches";
import { counts, mayGroup, pagesWord, startHere, tidy, toggleNotInvoice, toNext, toPrevious, type Grouping } from "@/lib/split";

const start: Grouping = { groups: [[1, 2], [3]], nonInvoice: [] };

describe("grouping pages into invoices", () => {
  it("moves a page to the previous and the next invoice", () => {
    expect(toNext(start, 2)).toEqual({ groups: [[1], [2, 3]], nonInvoice: [] });
    expect(toPrevious(toNext(start, 2), 2)).toEqual(start);
  });

  it("starts a new invoice when a page moves past the last", () => {
    expect(toNext(start, 3)).toEqual({ groups: [[1, 2], [3]], nonInvoice: [] }); // last alone: a new invoice of one page is itself
    expect(toNext({ groups: [[1, 2, 3]], nonInvoice: [] }, 3)).toEqual({ groups: [[1, 2], [3]], nonInvoice: [] });
  });

  it("does nothing moving the first invoice's page back", () => {
    expect(toPrevious(start, 1)).toBe(start);
  });

  it("starts an invoice at a page, taking the pages after it", () => {
    expect(startHere({ groups: [[1, 2, 3, 4]], nonInvoice: [] }, 3)).toEqual({ groups: [[1, 2], [3, 4]], nonInvoice: [] });
    expect(startHere(start, 1)).toBe(start);
  });

  it("puts a page in and out of 'not an invoice page'", () => {
    const out = toggleNotInvoice(start, 2);
    expect(out).toEqual({ groups: [[1], [3]], nonInvoice: [2] });
    expect(toggleNotInvoice(out, 2)).toEqual(start);
  });

  it("drops an emptied invoice and keeps invoices in page order", () => {
    expect(tidy({ groups: [[3], [], [2, 1]], nonInvoice: [5, 4] })).toEqual({ groups: [[1, 2], [3]], nonInvoice: [4, 5] });
  });

  it("counts reconcile: pages = invoice pages + non-invoice pages, each once", () => {
    expect(counts({ groups: [[1], [3]], nonInvoice: [2] }, 3)).toEqual({ pages: 3, invoices: 2, invoice_pages: 2, non_invoice_pages: 1, reconciles: true });
    expect(counts({ groups: [[1]], nonInvoice: [] }, 3).reconciles).toBe(false);
    expect(counts({ groups: [[1, 2], [2, 3]], nonInvoice: [] }, 3).reconciles).toBe(false);
  });

  it("names pages as people read them", () => {
    expect(pagesWord([4])).toBe("page 4");
    expect(pagesWord([3, 4, 5])).toBe("pages 3–5");
    expect(pagesWord([1, 3])).toBe("pages 1, 3");
  });

  it("lets reviewers group, never someone only viewing", () => {
    expect(mayGroup("reviewer")).toBe(true);
    expect(mayGroup("member")).toBe(true);
    expect(mayGroup("reader")).toBe(false);
    expect(mayGroup("admin", true)).toBe(false);
  });
});

describe("bulk upload", () => {
  const file = (name: string, type = "") => ({ name, type });

  it("sends ZIPs whole and refuses more than 50 other files at once", () => {
    const plan = planDrop([file("a.pdf"), file("week.ZIP"), file("b.png")]);
    expect(plan.zips.map((f) => f.name)).toEqual(["week.ZIP"]);
    expect(plan.files.map((f) => f.name)).toEqual(["a.pdf", "b.png"]);
    expect(plan.tooMany).toBe(false);
    expect(planDrop(Array.from({ length: MAX_FILES + 13 }, (_, n) => file(`${n}.pdf`))).tooMany).toBe(true);
    expect(isZip(file("bills", "application/x-zip-compressed"))).toBe(true);
  });

  it("checks a batch's counts add up", () => {
    const base = { total: 12, not_sent: 0, received: 10, already_received: 1, refused: 1, waiting: 4, processed: 8, ready: 6, split: 0, failed: 2 };
    expect(reconciles(base)).toBe(true);
    expect(reconciles({ ...base, refused: 0 })).toBe(false);
  });

  it("says what became of each file", () => {
    const item = (over: Partial<BatchItem>): BatchItem => ({
      id: "i", position: 0, filename: "a.pdf", size_bytes: 1, outcome: "received", reason: null, document_id: "d", state: "ready", error: null, ...over,
    });  // prettier-ignore
    expect(itemWords(item({})).word).toBe("Ready");
    expect(itemWords(item({ outcome: "already_received" })).word).toBe("Already here");
    expect(itemWords(item({ state: "refused", outcome: "refused", reason: "The file could not be read as a PDF." })).text).toBe("The file could not be read as a PDF.");
    expect(itemWords(item({ state: "failed", error: "The model provider failed." })).text).toBe("The model provider failed.");
    expect(itemWords(item({ state: "split_review" })).word).toBe("Group pages");
  });

  it("sends a few at a time and every one", async () => {
    let running = 0;
    let most = 0;
    const done: number[] = [];
    await pool([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      running += 1;
      most = Math.max(most, running);
      await new Promise((resolve) => setTimeout(resolve, 1));
      done.push(n);
      running -= 1;
    });
    expect(done.sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(most).toBe(3);
  });
});
