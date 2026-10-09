"use client";

import {
  BarChart3, Book, Bot, Eye, FileText, HelpCircle, Inbox, LayoutDashboard, LogOut, MessageSquare, Moon, Search, ShieldCheck, Sun, Upload, Webhook,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { Marks } from "@/components/ui";
import { api } from "@/lib/api";
import { isCurrent, navFor } from "@/lib/nav";
import { forgetEmail } from "@/lib/reviewer";
import { initials, type Caller } from "@/lib/signin";

const ICONS: Record<string, LucideIcon> = {
  inbox: Inbox, "file-text": FileText, upload: Upload, search: Search, "message-square": MessageSquare, book: Book,
  "bar-chart": BarChart3, "help-circle": HelpCircle, bot: Bot, "shield-check": ShieldCheck, webhook: Webhook,
  dashboard: LayoutDashboard,
};

const THEME_KEY = "docforge.theme";

const CallerContext = createContext<Caller | null>(null);

/** Who is signed in, for the screens that need it (signing, corrections, admin pages). */
export function useCaller(): Caller {
  const caller = useContext(CallerContext);
  if (!caller) throw new Error("useCaller outside the app shell");
  return caller;
}

/** What the signed-in person signs with: an account's password, or a team reviewer's PIN. */
export function useSecret(): "PIN" | "password" {
  return useContext(CallerContext)?.credential === "password" ? "password" : "PIN";
}

const THEME_EVENT = "docforge-theme";

function subscribeTheme(change: () => void): () => void {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", change);
  window.addEventListener(THEME_EVENT, change);
  return () => {
    media.removeEventListener("change", change);
    window.removeEventListener(THEME_EVENT, change);
  };
}

function currentTheme(): "light" | "dark" {
  const chosen = document.documentElement.dataset.theme;
  if (chosen === "light" || chosen === "dark") return chosen;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export type Viewing = { id: string; name: string } | null;

export function Shell({ caller, viewing = null, children }: { caller: Caller; viewing?: Viewing; children: ReactNode }) {
  const pathname = usePathname();
  const theme = useSyncExternalStore(subscribeTheme, currentTheme, () => null);
  const [waiting, setWaiting] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    api<unknown[]>("/review/queue")
      .then((items) => live && setWaiting(items.length))
      .catch(() => live && setWaiting(null));
    return () => {
      live = false;
    };
  }, [pathname]);

  const toggleTheme = () => {
    const next = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* storage unavailable: the choice lasts this visit */
    }
    window.dispatchEvent(new Event(THEME_EVENT));
  };

  const signOut = async () => {
    await fetch("/api/session", { method: "DELETE" }).catch(() => undefined);
    forgetEmail(); // a shared computer keeps nothing of the person who signed out
    // A full load on purpose: nothing from the ended session stays in memory.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/login");
  };

  const items = navFor(caller.role, caller.platform_admin);

  const leaveWorkspace = async () => {
    await fetch("/api/workspace", { method: "DELETE" }).catch(() => undefined);
    // A full load, so nothing read from their workspace stays on screen.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/admin");
  };
  const main = items.filter((item) => !item.admin);
  const admin = items.filter((item) => item.admin);
  const name = caller.name || "Signed in";
  const ThemeIcon = theme === "dark" ? Sun : Moon;
  const themeLabel = theme === "dark" ? "Light theme" : "Dark theme";

  const link = (item: (typeof items)[number]) => {
    const Icon = ICONS[item.icon] ?? FileText;
    const current = isCurrent(item.href, pathname);
    return (
      <li key={item.href}>
        <Link href={item.href} className="nav-item" aria-current={current ? "page" : undefined} title={item.label}>
          <Icon strokeWidth={1.5} aria-hidden="true" />
          <span className="nav-label">{item.label}</span>
          {item.href === "/" && waiting !== null && <span className="nav-count num">{waiting}</span>}
        </Link>
      </li>
    );
  };

  return (
    <CallerContext.Provider value={caller}>
    <div className="app">
      <nav className="sidebar" aria-label="DocForge">
        <div className="brand">
          <span className="brand-mark marked" aria-hidden="true">
            <Marks />D
          </span>
          <span className="nav-label">
            <span className="brand-name">DocForge</span>
            {caller.organisation && <span className="brand-org">{caller.organisation}</span>}
          </span>
        </div>
        <ul className="nav-list">{main.map(link)}</ul>
        {admin.length > 0 && (
          <>
            <p className="nav-group nav-label">Administration</p>
            <ul className="nav-list">{admin.map(link)}</ul>
          </>
        )}
        <div className="sidebar-foot">
          <span className="avatar" aria-hidden="true">
            {initials(name)}
          </span>
          <div className="nav-label person">
            <span className="person-name">{name}</span>
            <span className="person-meta">
              {caller.role === "admin" ? "Administrator" : "Reviewer"}
              {caller.email ? ` · ${caller.email}` : ""}
            </span>
          </div>
          <div className="foot-actions">
            <button className="btn btn-secondary" onClick={toggleTheme} aria-label={themeLabel} title={themeLabel}>
              <ThemeIcon size={16} strokeWidth={1.5} aria-hidden="true" />
              <span className="nav-label">{themeLabel}</span>
            </button>
            <button className="btn btn-secondary" onClick={signOut} aria-label="Sign out" title="Sign out">
              <LogOut size={16} strokeWidth={1.5} aria-hidden="true" />
              <span className="nav-label">Sign out</span>
            </button>
          </div>
        </div>
      </nav>
      <main className="main">
        {viewing && (
          <div className="viewing-strip" role="status">
            <Eye size={16} strokeWidth={1.5} aria-hidden="true" />
            <p>
              Viewing <b>{viewing.name || "a user's workspace"}</b>, read only. Nothing you do here changes it.
            </p>
            <button className="btn btn-secondary" onClick={() => void leaveWorkspace()}>
              Back to the dashboard
            </button>
          </div>
        )}
        {children}
      </main>
    </div>
    </CallerContext.Provider>
  );
}
