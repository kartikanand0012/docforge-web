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
