/** Search (screen 6): the query's words marked in a passage. */

export type Segment = { text: string; match: boolean };

const escape = (word: string) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function marked(text: string, query: string): Segment[] {
  const words = [...new Set(query.trim().split(/\s+/).filter(Boolean))].sort((a, b) => b.length - a.length);
  if (!words.length) return [{ text, match: false }];
  const pattern = new RegExp(`(${words.map(escape).join("|")})`, "gi");
  return text
    .split(pattern)
    .filter((part) => part !== "")
    .map((part) => ({ text: part, match: words.some((word) => word.toLowerCase() === part.toLowerCase()) }));
}

/** The line above the results: how many hold words of the search, and how many are only
 * close in meaning (a search by meaning always finds something, even for nonsense). */
export function searchSummary(results: { matched_words?: boolean }[], query: string): string {
  const worded = results.filter((result) => result.matched_words !== false).length;
  if (worded) {
    const near = results.length - worded;
    return `${worded} passage${worded === 1 ? "" : "s"} with words of “${query}”, best first${near ? `, then ${near} close in meaning` : ""}`;
  }
  return results.length ? `No passage contains “${query}”. ${results.length} close in meaning.` : "";
}
