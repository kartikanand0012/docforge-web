"use client";

import { Eye, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Denied, Marks, Tag, Time } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { count, usd } from "@/lib/format";
import { useTitle } from "@/lib/useTitle";

type Totals = {
  workspaces: number; accounts: number; documents: number; pages: number; signed: number; questions: number;
  model_cost_usd: number | null; documents_last_7_days: number; signups_last_7_days: number;
};  // prettier-ignore
type Workspace = {
  tenant_id: string; organisation: string; kind: "personal" | "organisation"; owner_name: string | null; owner_email: string | null;
  created_at: string; last_active_at: string | null; documents: number; pages: number; signed: number; questions: number;
  model_cost_usd: number | null; sign_ins: number;
};  // prettier-ignore
type Overview = { totals: Totals; workspaces: Workspace[] };
type Activity = { id: number; occurred_at: string; tenant_id: string; organisation: string; actor_name: string; action: string; action_label: string; target_label: string | null };
type ActivityPage = { items: Activity[]; next_before: number | null };

function Figure({ label, figure, sub }: { label: string; figure: string; sub?: string }) {
  return (
    <div className="metric marked">
      <Marks />
      <p className="muted" style={{ fontSize: 12.5 }}>{label}</p>
      <p className="metric-figure num">{figure}</p>
      {sub && <p className="muted num" style={{ fontSize: 12.5 }}>{sub}</p>}
    </div>
  );
}

export default function PlatformDashboard() {
  useTitle("Platform dashboard");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [next, setNext] = useState<number | null>(null);
  const [only, setOnly] = useState<string>("");
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const loads = useRef(0);

  const refuse = useCallback((caught: unknown, what: string) => {
    if (caught instanceof ApiError && caught.status === 403) setDenied(true);
    else setError(caught instanceof ApiError ? caught.detail : `${what} could not be loaded.`);
  }, []);

  const load = useCallback(() => {
    const ticket = ++loads.current;
    const filter = only ? `&tenant_id=${only}` : "";
    api<Overview>("/platform/overview").then((found) => ticket === loads.current && setOverview(found), (caught: unknown) => refuse(caught, "The overview"));
    api<ActivityPage>(`/platform/activity?limit=50${filter}`).then(
      (page) => {
        if (ticket !== loads.current) return;
        setActivity(page.items);
        setNext(page.next_before);
      },
      (caught: unknown) => refuse(caught, "The activity"),
    );
  }, [only, refuse]);

  useEffect(() => {
    load();
  }, [load]);

  const loadMore = async () => {
    if (next === null || more) return;
    const ticket = loads.current;
    setMore(true);
    try {
      const page = await api<ActivityPage>(`/platform/activity?limit=50&before=${next}${only ? `&tenant_id=${only}` : ""}`);
      if (ticket !== loads.current) return;
      setActivity((current) => [...current, ...page.items.filter((item) => !current.some((shown) => shown.id === item.id))]);
      setNext(page.next_before);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.detail : "More activity could not be loaded.");
    } finally {
      setMore(false);
    }
  };

  const view = async (workspace: Workspace) => {
    const response = await fetch("/api/workspace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenant_id: workspace.tenant_id, name: workspace.owner_name ? `${workspace.owner_name}'s workspace` : workspace.organisation }),
    }).catch(() => null);
    if (!response?.ok) return setError("That workspace could not be opened.");
    // A full load: every screen then reads that workspace, read only.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/documents");
  };

  if (denied) return <Denied />;
  const totals = overview?.totals;

  return (
    <div className="screen">
      <header className="screen-header">
        <div>
          <h1>Platform dashboard</h1>
          <p className="sub">Every workspace and what is happening in it. Opening one shows it read only, and the visit is recorded in its audit log.</p>
        </div>
        <button className="btn btn-secondary" onClick={load}>
          <RefreshCw size={14} strokeWidth={1.5} aria-hidden="true" /> Refresh
        </button>
      </header>
      <div className="screen-body">
        {error && <Alert kind="fail" title="Not loaded.">{error}</Alert>}
        {totals && (
          <div className="metrics">
            <Figure label="Accounts" figure={count(totals.accounts)} sub={`${count(totals.signups_last_7_days)} new in the last 7 days · ${count(totals.workspaces)} workspaces`} />
            <Figure label="Documents" figure={count(totals.documents)} sub={`${count(totals.documents_last_7_days)} in the last 7 days · ${count(totals.pages)} pages`} />
            <Figure label="Signed" figure={count(totals.signed)} sub={`${count(totals.questions)} questions asked`} />
            <Figure label="Model cost" figure={usd(totals.model_cost_usd)} sub="Gemini, all workspaces" />
          </div>
        )}

        {overview && (
          <section aria-labelledby="workspaces" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <h2 id="workspaces" style={{ fontSize: 18 }}>
              Workspaces
            </h2>
            {!overview.workspaces.length ? (
              <p className="muted">No workspaces yet.</p>
            ) : (
              <div className="table-wrap">
                <table className="table" style={{ minWidth: 960, fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th scope="col">Who</th>
                      <th scope="col">Kind</th>
                      <th scope="col">Joined</th>
                      <th scope="col">Last active</th>
                      <th scope="col" className="right">Documents</th>
                      <th scope="col" className="right">Signed</th>
                      <th scope="col" className="right">Questions</th>
                      <th scope="col" className="right">Sign-ins</th>
                      <th scope="col" className="right">Cost</th>
                      <th scope="col">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.workspaces.map((workspace) => (
                      <tr key={workspace.tenant_id}>
                        <td>
                          <span style={{ fontWeight: 500 }}>{workspace.owner_name ?? workspace.organisation}</span>
                          <br />
                          <span className="muted" style={{ fontSize: 12 }}>
                            {workspace.owner_email ?? workspace.organisation}
                          </span>
                        </td>
                        <td>
                          <Tag tone={workspace.kind === "personal" ? "neutral" : "accent"}>{workspace.kind === "personal" ? "Account" : "Organisation"}</Tag>
                        </td>
                        <td className="num">
                          <Time iso={workspace.created_at} />
                        </td>
                        <td className="num">{workspace.last_active_at ? <Time iso={workspace.last_active_at} /> : "—"}</td>
                        <td className="right num">{count(workspace.documents)}</td>
                        <td className="right num">{count(workspace.signed)}</td>
                        <td className="right num">{count(workspace.questions)}</td>
                        <td className="right num">{count(workspace.sign_ins)}</td>
                        <td className="right num">{usd(workspace.model_cost_usd)}</td>
                        <td style={{ whiteSpace: "nowrap" }}>
                          <button className="btn btn-ghost" onClick={() => setOnly(workspace.tenant_id)} aria-label={`Show the activity of ${workspace.owner_name ?? workspace.organisation}`}>
                            Activity
                          </button>
                          <button className="btn btn-secondary" onClick={() => void view(workspace)} aria-label={`View ${workspace.owner_name ?? workspace.organisation}'s workspace, read only`}>
                            <Eye size={14} strokeWidth={1.5} aria-hidden="true" /> View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        <section aria-labelledby="activity" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <h2 id="activity" style={{ fontSize: 18 }}>
              Activity
            </h2>
            {only && (
              <>
                <Tag>{overview?.workspaces.find((workspace) => workspace.tenant_id === only)?.owner_name ?? "One workspace"}</Tag>
                <button className="btn btn-ghost" onClick={() => setOnly("")}>
                  Show every workspace
                </button>
              </>
            )}
          </div>
          {!activity.length ? (
            <p className="muted">Nothing has happened yet.</p>
          ) : (
            <div className="table-wrap">
              <table className="table" style={{ minWidth: 760, fontSize: 13 }}>
                <thead>
                  <tr>
                    <th scope="col">When</th>
                    <th scope="col">Workspace</th>
                    <th scope="col">Who</th>
                    <th scope="col">What</th>
                    <th scope="col">On</th>
                  </tr>
                </thead>
                <tbody>
                  {activity.map((item) => (
                    <tr key={item.id}>
                      <td className="num" style={{ whiteSpace: "nowrap" }}>
                        <Time iso={item.occurred_at} seconds />
                      </td>
                      <td>{item.organisation}</td>
                      <td>{item.actor_name}</td>
                      <td style={{ fontWeight: 500 }}>{item.action_label}</td>
                      <td style={{ overflowWrap: "anywhere" }}>{item.target_label ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {next !== null && activity.length > 0 && (
            <button className="btn btn-secondary" style={{ alignSelf: "center" }} disabled={more} onClick={() => void loadMore()}>
              {more ? "Loading…" : "Load more"}
            </button>
          )}
        </section>
      </div>
    </div>
  );
}
