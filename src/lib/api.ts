/** The browser's only way to the API: same origin (`/api/v1/...`), the session cookie added by
 * the route handler. Errors carry the API's readable sentence (handover section 4). */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
    readonly retryAfter: number | null = null,
    readonly fields: string[] = [],
  ) {
    super(detail);
  }
}

const FALLBACK: Record<number, string> = {
  401: "Sign in to continue.",
  403: "Only administrators can see this page.",
  404: "Not found.",
  413: "The file is too large.",
  429: "Too many requests. Try again in a moment.",
  503: "A service is unavailable at the moment. Nothing was lost; try again shortly.",
};

export function errorFrom(status: number, body: unknown, headers: Headers): ApiError {
  const seconds = Number(headers.get("retry-after"));
  const retryAfter = Number.isFinite(seconds) && seconds > 0 ? seconds : null;
  const detail = (body as { detail?: unknown } | null)?.detail;
  if (Array.isArray(detail)) {
    const fields = detail
      .map((item) => (item as { loc?: unknown[] }).loc?.at(-1))
      .filter((field): field is string => typeof field === "string");
    return new ApiError(status, "Some of what was entered is not valid.", retryAfter, fields);
  }
  const sentence = typeof detail === "string" && detail ? detail : (FALLBACK[status] ?? "Something went wrong.");
  return new ApiError(status, sentence, retryAfter);
}

export function toLogin(): void {
  if (typeof window === "undefined" || window.location.pathname === "/login") return;
  const next = `${window.location.pathname}${window.location.search}`;
  // A full load on purpose: every piece of state from the ended session is dropped.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign(`/login?next=${encodeURIComponent(next)}`);
}

export function apiUrl(path: string): string {
  return `/api/v1${path.startsWith("/") ? path : `/${path}`}`;
}

/** A JSON request. 401 anywhere sends the person to sign in again. */
export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  const response = await fetch(apiUrl(path), {
    ...rest,
    headers: json === undefined ? headers : { "Content-Type": "application/json", ...headers },
    body: json === undefined ? rest.body : JSON.stringify(json),
    cache: "no-store",
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    if (response.status === 401) toLogin();
    throw errorFrom(response.status, body, response.headers);
  }
  if (response.status === 204) return undefined as T;
  const type = response.headers.get("content-type") ?? "";
  return (type.includes("json") ? await response.json() : await response.text()) as T;
}

export type Uploaded<T> = { status: number; body: T };

/** An upload with progress (fetch cannot report it): resolves with the status and body,
 * rejects with an ApiError the screen can show. */
export function upload<T>(path: string, form: FormData, onProgress: (fraction: number) => void): Promise<Uploaded<T>> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", apiUrl(path));
    request.upload.onprogress = (event) => event.lengthComputable && onProgress(event.loaded / event.total);
    request.onload = () => {
      let body: unknown = null;
      try {
        body = JSON.parse(request.responseText);
      } catch {
        /* not JSON */
      }
      if (request.status >= 200 && request.status < 300) return resolve({ status: request.status, body: body as T });
      if (request.status === 401) toLogin();
      const headers = new Headers();
      const retry = request.getResponseHeader("retry-after");
      if (retry) headers.set("retry-after", retry);
      reject(errorFrom(request.status, body, headers));
    };
    request.onerror = () => reject(new ApiError(0, "The upload did not reach DocForge. Check the connection and try again."));
    request.send(form);
  });
}
