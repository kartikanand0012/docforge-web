/** V2 P4: the purchase register and its 2B check are a comparison and data flags for the CA to
 * decide on. No text in the app may call them a reconciliation with the portal, GSTN or 2B,
 * claim filing or a link with the GSTN, or decide input tax credit eligibility: "eligible" or
 * "eligibility" appears only in the column header "ITC Eligibility Note" and the help sentence
 * that says it is not such a judgement. Every source file under src is scanned, a line and the
 * line after it together (text wrapped over two lines is still one sentence). */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const RECONCILE = /reconcil/i;
const WHERE = /portal|gstn|\b2b\b|gstr/i;
const FILING = /gstn integration|integrat\w* with (the )?(gstn|gst portal)|(files?|filing|filed) (on|with|to) (the )?(gstn|gst portal)/i;
const ELIGIBLE = /eligib(le|ility)/i;
// The two places the word may stand: the file's column header, and the sentence saying it is no judgement.
const ALLOWED = [/ITC Eligibility Note/g, /not a judgement of eligibility/gi];

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

const cleared = (text: string) => ALLOWED.reduce((rest, allowed) => rest.replace(allowed, ""), text);

/** The lines that make a claim the app may not make, as "file:line: text". */
function offending(file: string, text: string): string[] {
  const lines = text.split("\n");
  const found: string[] = [];
  lines.forEach((line, index) => {
    const pair = `${line} ${lines[index + 1] ?? ""}`;
    const sentences = pair.split(/(?<=[.!?])\s+/);
    const reconciles = sentences.some((s) => RECONCILE.test(s) && WHERE.test(s)) && (RECONCILE.test(line) || WHERE.test(line));
    const files = FILING.test(line);
    const decides = ELIGIBLE.test(cleared(line));
    if (reconciles || files || decides) found.push(`${file}:${index + 1}: ${line.trim()}`);
  });
  return found;
}

describe("what the app says about the purchase register and the 2B check (V2 P4)", () => {
  it("catches each kind of claim, also over two lines, and passes the plain words", () => {
    for (const bad of [
      "Reconcile with the GST portal.", "2B reconciliation", "Reconciled against GSTN.", "GSTR-2B reconciliation report",
      "Filed with the GSTN for you.", "GSTN integration", "These bills are eligible for ITC.", "ITC eligibility: yes",
    ]) {  // prettier-ignore
      expect(offending("x.tsx", bad), bad).toHaveLength(1);
    }
    expect(offending("x.tsx", "We reconcile this\nwith the 2B file.")).not.toHaveLength(0);
    for (const fine of [
      "2B check", "A comparison with the GSTR-2B file you uploaded.", "data flags for your CA to decide on", '"ITC Eligibility Note"',
      "It is not a judgement of eligibility for input tax credit and not tax advice.", "Totals reconciled in Decimal.",
    ]) {  // prettier-ignore
      expect(offending("x.tsx", fine), fine).toEqual([]);
    }
  });

  it("finds no such claim in any source file", () => {
    const files = sources(join(ROOT, "src"));
    expect(files.length).toBeGreaterThan(50);
    const found = files.flatMap((path) => offending(relative(ROOT, path), readFileSync(path, "utf8")));
    expect(found, `The register or 2B check named with a claim it may not make:\n${found.join("\n")}`).toEqual([]);
  });
});
