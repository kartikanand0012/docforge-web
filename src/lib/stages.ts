/** Where a document is (handover section 6), as a word, a status kind and a step. */

export type StatusKind = "ok" | "warn" | "fail" | "info" | "neutral";

const WORDS: Record<string, string> = {
  stored: "Queued",
  converting: "Converting",
  parsing: "Reading",
  extracting: "Extracting",
  checking: "Checking",
  indexing: "Indexing",
  processed: "Done",
  ready: "Ready",
  retrying: "Retrying",
  failed: "Failed",
};

const STEPS: Record<string, number> = {
  stored: 1, converting: 2, parsing: 2, extracting: 3, checking: 4, indexing: 5, processed: 6, ready: 6,
};

export const STAGE_STEPS = 6;
export const IN_PROGRESS = new Set(["stored", "converting", "parsing", "extracting", "checking", "indexing", "retrying"]);

export function stageWord(stage: string): string {
  return WORDS[stage] ?? stage;
}

export function stageKind(stage: string): StatusKind {
  if (stage === "ready" || stage === "processed") return "ok";
  if (stage === "failed") return "fail";
  if (stage === "retrying") return "warn";
  return "info";
}

/** Step n of 6, or null for a stage that is not on the way (failed, retrying, unknown). */
export function stageStep(stage: string): { step: number; of: number } | null {
  const step = STEPS[stage];
  return step ? { step, of: STAGE_STEPS } : null;
}

export function isFinished(stage: string): boolean {
  return stage === "ready" || stage === "processed" || stage === "failed";
}
