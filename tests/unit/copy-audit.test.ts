/** AC-P3-7: "Marg" appears only with "import file", "purchase import" or "profile". No text in
 * the app may claim a direct link with Marg, posting or syncing to it, compatibility, or a
 * verified format. Every source file under src is scanned, a line and the line after it
 * together (text wrapped over two lines is still one sentence). */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// vitest runs from the repository's root (jsdom gives import.meta.url no file scheme).
const ROOT = process.cwd();
const SELF = resolve(ROOT, "tests/unit/copy-audit.test.ts");
const CLAIM = /direct integration|integrates? with|auto-?posts?|posts? to marg|sync(s|ed)? with marg|marg[- ]compatible|compatible with marg|verified/i;
const MARG = /marg/i;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) && path !== SELF ? [path] : [];
  });
}

/** The places where Marg is named with a claim, as "file:line: text". */
function offending(file: string, text: string): string[] {
  const lines = text.split("\n");
  const found: string[] = [];
  lines.forEach((line, index) => {
    const pair = `${line} ${lines[index + 1] ?? ""}`;
    // A sentence may wrap: Marg on one line and the claim on the next, either way round.
    const sentences = pair.split(/(?<=[.!?])\s+/);
    if (sentences.some((sentence) => MARG.test(sentence) && CLAIM.test(sentence)) && (MARG.test(line) || CLAIM.test(line))) {
      found.push(`${file}:${index + 1}: ${line.trim()}`);
    }
  });
  return found;
}

describe("what the app says about Marg (AC-P3-7)", () => {
  it("catches each kind of claim, also over two lines, and passes the plain words", () => {
    for (const bad of [
      "DocForge integrates with Marg.", "Direct integration with Marg ERP.", "Bills auto-post to Marg.", "It posts to Marg for you.",
      "Syncs with Marg nightly.", "A Marg-compatible file.", "Compatible with Marg 9.", "A verified Marg format.",
    ]) {  // prettier-ignore
      expect(offending("x.tsx", bad), bad).toHaveLength(1);
    }
    expect(offending("x.tsx", "Upload the file your Marg accepted.\nDocForge integrates with nothing.")).toHaveLength(0);
    expect(offending("x.tsx", "This export\nsyncs with Marg each night.")).not.toHaveLength(0);
    for (const fine of ["Marg purchase import", "Settings > Marg profile", "The import file Marg accepted", "SAMPLE layout — made up, not a Marg format"]) {
      expect(offending("x.tsx", fine), fine).toEqual([]);
    }
  });

  it("finds no claim in any source file", () => {
    const files = sources(join(ROOT, "src"));
    expect(files.length).toBeGreaterThan(50);
    const found = files.flatMap((path) => offending(relative(ROOT, path), readFileSync(path, "utf8")));
    expect(found, `Marg named with a claim it may not make:\n${found.join("\n")}`).toEqual([]);
  });
});
