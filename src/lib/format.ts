/** How values read on screen: money as Indian documents print it, times in the viewer's own
 * zone (the UTC instant goes in <time dateTime>), hashes short or grouped. */

const RUPEES = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function money(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const number = typeof value === "number" ? value : Number(String(value).replace(/,/g, ""));
  return Number.isFinite(number) ? `₹${RUPEES.format(number)}` : String(value);
}

export function count(value: number): string {
  return new Intl.NumberFormat("en-IN").format(value);
}

type TimeOptions = { now?: Date; timeZone?: string; seconds?: boolean };

function dayKey(date: Date, timeZone?: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

/** "Today, 11:44" or "7 Oct, 11:46" (24-hour, as the design shows). */
export function localTime(iso: string, options: TimeOptions = {}): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const { now = new Date(), timeZone, seconds = false } = options;
  const clock = new Intl.DateTimeFormat("en-GB", {
    timeZone, hour: "2-digit", minute: "2-digit", second: seconds ? "2-digit" : undefined, hour12: false,
  }).format(date);
  if (dayKey(date, timeZone) === dayKey(now, timeZone)) return `Today, ${clock}`;
  const day = new Intl.DateTimeFormat("en-GB", { timeZone, day: "numeric", month: "short" }).format(date);
  return `${day}, ${clock}`;
}

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;

/** How long something has waited, in the largest whole unit. */
export function waiting(iso: string, now: Date = new Date()): string {
  const minutes = Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "Just received";
  if (minutes < 60) return `Waiting ${plural(minutes, "minute")}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Waiting ${plural(hours, "hour")}`;
  return `Waiting ${plural(Math.floor(hours / 24), "day")}`;
}

export function hashShort(sha: string): string {
  return sha.length > 16 ? `${sha.slice(0, 8)} … ${sha.slice(-8)}` : sha;
}

export function hashGroups(sha: string): string {
  return sha.match(/.{1,8}/g)?.join(" ") ?? sha;
}

export function bytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
