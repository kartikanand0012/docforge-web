import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { SESSION_COOKIE, apiBase } from "@/lib/server";
import { callerFrom, type Caller } from "@/lib/signin";

/** Who is signed in, asked of the API once per request; null when the session has ended.
 * The token goes only to the API, never to the page. */
export const getCaller = cache(async (): Promise<Caller | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const response = await fetch(`${apiBase()}/v1/sessions/current`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    return callerFrom(response.status, await response.json().catch(() => null));
  } catch {
    // The API is unreachable: let the page load and say so itself, rather than sign out.
    return callerFrom(404, null);
  }
});
