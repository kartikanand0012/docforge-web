import { describe, expect, it } from "vitest";
import { answerBadge, type Answer } from "@/lib/chat";

const base: Answer = {
  conversation_id: "c", message_id: "m", status: "supported", text: "t", citations: [],
  dropped_citations: 0, dropped_statements: 0, reason: null, reason_detail: {}, words_only: false,
};  // prettier-ignore

describe("an answer's badge", () => {
  it("says in words how far the answer is backed by its quotes", () => {
    expect(answerBadge(base)).toEqual({ kind: "ok", word: "Every statement checked" });
    expect(answerBadge({ ...base, status: "partly_supported", dropped_statements: 1 })).toEqual({
      kind: "warn", word: "Partly supported: 1 statement left out",
    });
    expect(answerBadge({ ...base, status: "partly_supported", dropped_statements: 0, dropped_citations: 2 }).word).toBe(
      "Partly supported: 2 quotes left out",
    );
    expect(answerBadge({ ...base, status: "not_found" })).toEqual({ kind: "neutral", word: "Not in the documents" });
    expect(answerBadge({ ...base, status: "unsupported" })).toEqual({ kind: "fail", word: "Withheld" });
  });
});
