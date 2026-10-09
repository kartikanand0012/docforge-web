/** The sidebar's items, by role, and the paths that need no session. */

export type NavItem = { href: string; label: string; icon: string; admin?: boolean };

const MAIN: NavItem[] = [
  { href: "/", label: "Review queue", icon: "inbox" },
  { href: "/documents", label: "Documents", icon: "file-text" },
  { href: "/upload", label: "Upload", icon: "upload" },
  { href: "/search", label: "Search", icon: "search" },
  { href: "/chat", label: "Chat", icon: "message-square" },
  { href: "/collections", label: "Knowledge bases", icon: "book" },
  { href: "/evals", label: "Evals and cost", icon: "bar-chart" },
];

const ADMIN: NavItem[] = [
  { href: "/questions", label: "Unanswered questions", icon: "help-circle", admin: true },
  { href: "/agents", label: "AI agents", icon: "bot", admin: true },
  { href: "/audit", label: "Audit log", icon: "shield-check", admin: true },
  { href: "/webhooks", label: "Webhooks", icon: "webhook", admin: true },
];

export function navFor(role: string): NavItem[] {
  return role === "admin" ? [...MAIN, ...ADMIN] : MAIN;
}

export function isAdminPath(pathname: string): boolean {
  return ADMIN.some((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
}

export function isCurrent(href: string, pathname: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

const OPEN = ["/login", "/api/", "/_next/", "/favicon"];

/** An optimistic check for the proxy: a page without the session cookie goes to sign-in. The
 * API decides for real on every request. */
export function needsSignIn(pathname: string, hasSession: boolean): boolean {
  return !hasSession && !OPEN.some((prefix) => pathname === prefix || pathname.startsWith(prefix));
}
