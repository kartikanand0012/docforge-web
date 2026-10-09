/** Signing in (screen 1) and who is signed in. */

export type Caller = {
  kind: string;
  name: string;
  email: string | null;
  role: string; // admin, reviewer, member (a self-service account), observer (an administrator looking in)
  organisation: string;
  credential?: "pin" | "password"; // what signs: a team's reviewers have PINs, accounts passwords
  platform_admin?: boolean;
  workspace?: "personal" | "organisation";
};

export type SignIn = { tenant: string; email: string; pin: string };

/** An account signs in with its email and password; a team's reviewer adds the
 * organisation and uses a PIN. */
export function validSignIn({ tenant, email, pin }: SignIn): string | null {
  if (!email.trim()) return "Enter your email.";
  if (tenant.trim() ? !/^\d{6,}$/.test(pin) : pin.length < 6) return tenant.trim() ? "Enter your 6-digit PIN." : "Enter your password.";
  return null;
}

export type SignUp = { name: string; email: string; password: string };

export function validSignUp({ name, email, password }: SignUp): string | null {
  if (!name.trim()) return "Enter your name.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return "Enter a valid email address.";
  if (password.length < 10) return "Choose a password of at least 10 characters.";
  if (password.length > 128) return "Choose a password of at most 128 characters.";
  return null;
}

/** What went wrong creating an account, in words. */
export function signUpError(status: number, detail: string | null, retryAfter: number | null): string {
  if (status === 409) return "An account with this email already exists. Sign in instead.";
  if (status === 429) return `Too many accounts were created from here just now. Try again in ${Math.ceil((retryAfter ?? 3600) / 60)} minutes.`;
  if (status === 404) return "New accounts are not open on this deployment.";
  if (status === 422) return detail ?? "Check the details and try again.";
  return "Creating an account is unavailable at the moment. Try again shortly.";
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
    return { kind: "warn", text: `Too many wrong attempts. Signing in is locked for 15 minutes; try again at ${at}.` };
  }
  if (status === 401 || status === 422) {
    return { kind: "fail", text: "Those sign-in details are not right. Check your email and password (or organisation and PIN)." };
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
