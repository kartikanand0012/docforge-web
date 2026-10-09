/** Signing in (screen 1) and who is signed in. */

export type Caller = { kind: string; name: string; email: string | null; role: string; organisation: string };

export type SignIn = { tenant: string; email: string; pin: string };

export function validSignIn({ tenant, email, pin }: SignIn): string | null {
  if (!tenant.trim() || !email.trim()) return "Enter your organisation and email.";
  if (!/^\d{6,}$/.test(pin)) return "Enter your 6-digit PIN.";
  return null;
}

/** One message whatever was wrong (the API does not say which); a lock says when it ends. */
export function signInError(
  status: number,
  retryAfter: number | null,
  now: Date = new Date(),
  timeZone?: string,
): { kind: "fail" | "warn"; text: string } {
  if (status === 429) {
    const until = new Date(now.getTime() + (retryAfter ?? 900) * 1000);
    const at = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hour12: false }).format(until);
    return { kind: "warn", text: `Too many wrong PINs. Signing in is locked for 15 minutes; try again at ${at}.` };
  }
  if (status === 401 || status === 422) {
    return { kind: "fail", text: "Those sign-in details are not right. Check the organisation, email and PIN." };
  }
  return { kind: "fail", text: "Signing in is unavailable at the moment. Try again shortly." };
}

const UNKNOWN: Caller = { kind: "session", name: "", email: null, role: "reviewer", organisation: "" };

/** The caller from `GET /v1/sessions/current`; null only when the session itself is refused
 * (401, 403). An API from before that endpoint (404, 405), or one briefly unwell (5xx), still
 * lets the person in, shown as a reviewer: the API checks every request anyway. */
export function callerFrom(status: number, body: unknown): Caller | null {
  if (status === 200 && body && typeof body === "object") return body as Caller;
  if (status === 401 || status === 403) return null;
  return UNKNOWN;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ?? "?").slice(0, 2)).toUpperCase();
}
