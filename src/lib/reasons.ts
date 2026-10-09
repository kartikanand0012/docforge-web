/** Why a document needs a person: the backend's reason sentences (trust/assess.py and
 * review/service.py) named the way the design names them (component 8). */

export type ReasonLabel = "Check failed" | "Uncertain value" | "Does not match its order" | "Not linked yet";
export type Reason = { kind: "fail" | "warn" | "info"; label: ReasonLabel; text: string };

const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export function classify(sentence: string): Reason {
  const text = capital(sentence.trim());
  const lower = sentence.toLowerCase();
  if (lower.includes("does not match its purchase order")) return { kind: "fail", label: "Does not match its order", text };
  if (lower.includes("no purchase order on file")) return { kind: "info", label: "Not linked yet", text };
  if (lower.includes("failed") || lower.includes("outside their limits")) return { kind: "fail", label: "Check failed", text };
  return { kind: "warn", label: "Uncertain value", text };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "9 documents need a person, oldest first · 4 failed checks, 4 uncertain values, …":
 * each count is of documents with that kind of reason. */
export function queueSummary(items: { reasons: string[] }[]): string {
  const head = `${plural(items.length, "document needs", "documents need")} a person, oldest first`;
  const counts = new Map<ReasonLabel, number>();
  for (const item of items) {
    for (const label of new Set(item.reasons.map((reason) => classify(reason).label))) {
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
  }
  const parts = [
    counts.get("Check failed") && plural(counts.get("Check failed")!, "failed check", "failed checks"),
    counts.get("Uncertain value") && plural(counts.get("Uncertain value")!, "uncertain value", "uncertain values"),
    counts.get("Does not match its order") && plural(counts.get("Does not match its order")!, "order mismatch", "order mismatches"),
    counts.get("Not linked yet") && plural(counts.get("Not linked yet")!, "without an order", "without an order"),
  ].filter(Boolean);
  return parts.length ? `${head} · ${parts.join(", ")}` : head;
}
