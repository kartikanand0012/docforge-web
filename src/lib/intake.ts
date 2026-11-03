/** Invoices by email (V2 P5): each workspace's forwarding address, the senders it takes mail
 * from, and the Intake list of mail received with what became of each attachment. A bill
 * forwarded to the address is read exactly as an upload is. The address is shown whole only in
 * the answer to making it (its token is not stored); after that it is masked. */

import { api } from "@/lib/api";

export type IntakeAddress = { address: string; whole: boolean; created_by: string; created_at: string };
export type IntakeSender = { id: string; sender: string; created_by: string; created_at: string };

export type IntakeSettings = {
  enabled: boolean; domain: string | null; address: IntakeAddress | null; senders: IntakeSender[]; trust_accepted: boolean;
  per_sender_hourly: number;
};  // prettier-ignore

export type ItemOutcome = "received" | "already_received" | "ignored" | "refused" | "held" | "discarded";
export type MessageStatus = "received" | "held" | "rejected" | "accepted" | "discarded";

export type IntakeItem = {
  id: string; position: number; filename: string; size_bytes: number; outcome: ItemOutcome | string; reason: string | null;
  document_id: string | null; document_status: string | null;
};  // prettier-ignore

export type IntakeMessage = {
  id: string; sender: string; subject: string; status: MessageStatus | string; reason: string | null; received_at: string;
  decided_by: string | null; decided_at: string | null; items: IntakeItem[];
};  // prettier-ignore

export type IntakeView = "all" | "held" | "failed" | "ignored" | "rejected";

export const VIEWS: { value: IntakeView; label: string }[] = [
  { value: "all", label: "All" },
  { value: "held", label: "Held" },
  { value: "failed", label: "Failed" },
  { value: "ignored", label: "Ignored" },
  { value: "rejected", label: "Rejected" },
];

export const SETTINGS_PATH = "/settings/intake";
export const LIST_PATH = "/intake";
export const MAX_HOURLY = 10_000;

/** Settings › Email intake: the workspace's administrators, or a personal workspace's person
 * (as for the workspace's other settings), and never while an administrator is viewing. */
export function mayChangeIntake(role: string, viewing = false): boolean {
  return !viewing && (role === "admin" || role === "member");
}

/** Accept, Discard and Retry: whoever reviews bills. */
export function mayDecide(role: string, viewing = false): boolean {
  return !viewing && (role === "admin" || role === "reviewer" || role === "member");
}

/* ---- Settings › Email intake ---- */

export function getIntakeSettings(): Promise<IntakeSettings> {
  return api<IntakeSettings>("/settings/intake");
}

/** A new address, whole in this answer only; any address before it stops at once. */
export function makeAddress(): Promise<IntakeSettings> {
  return api<IntakeSettings>("/settings/intake/address", { method: "POST" });
}

export function changeIntakeSettings(change: { trust_accepted?: boolean; per_sender_hourly?: number }): Promise<IntakeSettings> {
  return api<IntakeSettings>("/settings/intake", { method: "PATCH", json: change });
}

/** A whole address (name@domain.in) or a domain (@domain.in). */
export function addSender(sender: string): Promise<IntakeSender> {
  return api<IntakeSender>("/settings/intake/senders", { method: "POST", json: { sender: sender.trim() } });
}

export function removeSender(id: string): Promise<void> {
  return api<void>(`/settings/intake/senders/${encodeURIComponent(id)}`, { method: "DELETE" });
}

/** A made-up sample invoice put through intake as mail from DocForge. */
export function sendTest(): Promise<IntakeMessage> {
  return api<IntakeMessage>("/settings/intake/test", { method: "POST" });
}

/* ---- the Intake list ---- */

/** Newest first. */
export function listMessages(view: IntakeView = "all", limit = 50): Promise<IntakeMessage[]> {
  const params = new URLSearchParams({ view, limit: String(limit) });
  return api<IntakeMessage[]>(`/intake/messages?${params}`);
}

export function acceptMessage(id: string): Promise<IntakeMessage> {
  return api<IntakeMessage>(`/intake/messages/${encodeURIComponent(id)}/accept`, { method: "POST" });
}

export function discardMessage(id: string): Promise<IntakeMessage> {
  return api<IntakeMessage>(`/intake/messages/${encodeURIComponent(id)}/discard`, { method: "POST" });
}

/** Reads again a document whose reading failed. */
export function retryItem(id: string): Promise<void> {
  return api<void>(`/intake/items/${encodeURIComponent(id)}/retry`, { method: "POST" });
}

/* ---- words ---- */

const withReason = (words: string, reason: string | null) => (reason ? `${words}: ${reason}` : words);

/** What became of one attachment, in plain words. */
export function itemWords(item: Pick<IntakeItem, "outcome" | "reason">): string {
  switch (item.outcome) {
    case "received":
      return "received";
    case "already_received":
      return "already received";
    case "ignored":
      return withReason("ignored", item.reason);
    case "refused":
      return withReason("not accepted", item.reason);
    case "held":
      return withReason("held", item.reason);
    case "discarded":
      return "discarded";
    default:
      return withReason(item.outcome, item.reason);
  }
}

export type Kind = "ok" | "warn" | "fail" | "info" | "neutral";

export function itemKind(item: Pick<IntakeItem, "outcome" | "document_status">): Kind {
  if (item.document_status === "failed") return "fail";
  if (item.outcome === "received" || item.outcome === "already_received") return "ok";
  if (item.outcome === "held") return "warn";
  if (item.outcome === "refused") return "fail";
  return "neutral";
}

const STATUS: Record<string, { words: string; kind: Kind }> = {
  received: { words: "Received", kind: "ok" },
  held: { words: "Held for review", kind: "warn" },
  rejected: { words: "Rejected", kind: "fail" },
  accepted: { words: "Accepted", kind: "ok" },
  discarded: { words: "Discarded", kind: "neutral" },
};

export function statusWords(status: string): string {
  return STATUS[status]?.words ?? status;
}

export function statusKind(status: string): Kind {
  return STATUS[status]?.kind ?? "neutral";
}

/** Where the document an attachment made is, in words; null when it made none. */
export function documentWords(status: string | null): string | null {
  if (!status) return null;
  if (status === "failed") return "reading failed";
  if (status === "received" || status === "processing") return "being read";
  if (status === "processed" || status === "ready") return "read";
  return status;
}

/** A held mail can be accepted or discarded while any attachment is still held. */
export function isHeld(message: IntakeMessage): boolean {
  return message.status === "held" || message.items.some((item) => item.outcome === "held");
}

/** Retry is offered for an attachment whose document's reading failed. */
export function mayRetry(item: IntakeItem): boolean {
  return item.document_status === "failed" && item.document_id !== null;
}

/** The test mail has arrived once every document it made is past being read (or none was made). */
export function settled(message: IntakeMessage): boolean {
  return message.items.every((item) => !item.document_id || (item.document_status !== null && documentWords(item.document_status) !== "being read"));
}
