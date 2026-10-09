"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ConfirmDialog, SecretDialog } from "@/components/Dialog";
import { useToast } from "@/components/Toast";
import { Alert, Denied, Marks, StatusBadge, Time } from "@/components/ui";
import { claudeCodeCommand, mcpEndpoint, OUTCOME_TEXT } from "@/lib/agents";
import { ApiError, api } from "@/lib/api";

type Key = { prefix: string; name: string; role: string; created_by: string | null; created_at: string; last_used_at: string | null; revoked_at: string | null };
type Made = { token: string; prefix: string; name: string; role: string };
type Call = { tool: string; outcome: string; key_name: string; scope: string; results: number; duration_ms: number; created_at: string };

const MAX_KEYS = 20;

function Copy({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="btn btn-secondary"
      aria-label={label}
      onClick={() => navigator.clipboard.writeText(text).then(() => setDone(true), () => setDone(false))}
    >
      {done ? "Copied" : "Copy"}
    </button>
  );
}

export default function AgentsPage() {
  const toast = useToast();
  const [keys, setKeys] = useState<Key[] | null>(null);
  const [calls, setCalls] = useState<Call[]>([]);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [secret, setSecret] = useState<Made | null>(null);
  const [revoking, setRevoking] = useState<Key | null>(null);
  const [origin, setOrigin] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    () =>
      Promise.all([api<Key[]>("/api-keys"), api<Call[]>("/agent-calls").catch(() => [] as Call[])]).then(
        ([found, latest]) => {
          setKeys(found);
          setCalls(latest);
        },
        (caught: unknown) => {
          if (caught instanceof ApiError && caught.status === 403) setDenied(true);
          else setError(caught instanceof ApiError ? caught.detail : "The keys could not be loaded.");
        },
      ),
    [],
  );
  useEffect(() => {
    void load();
    queueMicrotask(() => setOrigin(window.location.origin));
  }, [load]);

  if (denied) return <Denied />;

  const live = (keys ?? []).filter((key) => !key.revoked_at);
  const endpoint = mcpEndpoint(origin);

  const make = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return setFormError("Name the key after the agent or person who will use it.");
    if (live.length >= MAX_KEYS) return setFormError("This organisation has 20 keys, the most allowed. Revoke one first.");
    try {
      setSecret(await api<Made>("/api-keys", { method: "POST", json: { name: name.trim() } }));
      setName("");
      setFormError(null);
      void load();
    } catch (caught) {
      setFormError(caught instanceof ApiError ? caught.detail : "The key could not be made.");
    }
  };

  return (
    <div className="screen">
      <header className="screen-header">
        <div>
          <h1>AI agents</h1>
          <p className="sub">
            Agents such as Claude Code read DocForge through MCP with a read-only key. They can search, ask and read values; they cannot upload,
            correct or sign.
          </p>
        </div>
      </header>
      <div className="screen-body" style={{ maxWidth: 1000 }}>
        {error && <Alert kind="fail" title="Not loaded.">{error}</Alert>}
        <section className="connect-card marked" aria-labelledby="connect-title">
          <Marks />
          <h2 id="connect-title" style={{ fontSize: 18 }}>
            Connect an agent
          </h2>
          <div className="field">
            <span className="label">Endpoint</span>
            <div className="copy-row">
              <code className="secret">{endpoint}</code>
              <Copy text={endpoint} label="Copy the endpoint" />
            </div>
          </div>
          <div className="field">
            <span className="label">Claude Code</span>
            <div className="copy-row">
              <code className="secret">{claudeCodeCommand(endpoint, "<key>")}</code>
              <Copy text={claudeCodeCommand(endpoint, "<key>")} label="Copy the Claude Code command" />
            </div>
          </div>
          <p className="muted" style={{ fontSize: 13 }}>
            Six read-only tools: list knowledge bases, list documents, search, ask, get a document&apos;s values, read a page. Each key may make
            60 calls a minute, 4 at once.
          </p>
        </section>

        <section aria-labelledby="keys-title" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <h2 id="keys-title" style={{ fontSize: 18 }}>
            Keys <span className="muted num" style={{ fontSize: 14, fontWeight: 400 }}>{live.length} of {MAX_KEYS} keys</span>
          </h2>
          <form onSubmit={make} noValidate style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div className="field" style={{ flex: 1, minWidth: 240 }}>
              <label htmlFor="key-name">Name of the agent or person using it</label>
              <input id="key-name" className="input" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={formError ? true : undefined} />
            </div>
            <button type="submit" className="btn btn-primary marked">
              <Marks />
              Make a key
            </button>
          </form>
          {formError && (
            <p role="alert" className="reason-box reason-fail" style={{ fontSize: 13 }}>
              {formError}
            </p>
          )}
          {keys && (
            <div className="table-wrap">
              <table className="table" style={{ minWidth: 720 }}>
                <thead>
                  <tr>
                    <th scope="col">Name</th>
                    <th scope="col">Key starts</th>
                    <th scope="col">Access</th>
                    <th scope="col">Made</th>
                    <th scope="col">Last used</th>
                    <th scope="col">
                      <span className="sr-only">Revoke</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {live.map((key) => (
                    <tr key={key.prefix}>
                      <td>{key.name}</td>
                      <td className="mono">dfk_{key.prefix}…</td>
                      <td>{key.role === "reader" ? "Read only" : key.role}</td>
                      <td className="num">
                        <Time iso={key.created_at} />
                      </td>
                      <td className="num">{key.last_used_at ? <Time iso={key.last_used_at} /> : "Never"}</td>
                      <td className="right">
                        <button className="btn btn-ghost btn-danger" aria-label={`Revoke the key for ${key.name}`} onClick={() => setRevoking(key)}>
                          Revoke
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!live.length && (
                    <tr>
                      <td colSpan={6} className="muted">
                        No keys yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section aria-labelledby="calls-title" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <h2 id="calls-title" style={{ fontSize: 18 }}>
            Latest calls
          </h2>
          {calls.length ? (
            <div className="table-wrap">
              <table className="table" style={{ minWidth: 620 }}>
                <thead>
                  <tr>
                    <th scope="col">When</th>
                    <th scope="col">Key</th>
                    <th scope="col">Tool</th>
                    <th scope="col">Outcome</th>
                  </tr>
                </thead>
                <tbody>
                  {calls.map((call, index) => (
                    <tr key={index}>
                      <td className="num">
                        <Time iso={call.created_at} seconds />
                      </td>
                      <td>{call.key_name}</td>
                      <td className="mono">{call.tool}</td>
                      <td>
                        <StatusBadge kind={call.outcome === "ok" ? "ok" : call.outcome === "limited" ? "warn" : call.outcome === "not_found" ? "neutral" : "fail"}>
                          {OUTCOME_TEXT[call.outcome] ?? call.outcome}
                        </StatusBadge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted">No agent has called DocForge yet.</p>
          )}
        </section>
      </div>

      {secret && (
        <SecretDialog
          title={`Key for ${secret.name}`}
          secret={secret.token}
          body="This is the only time the key is shown. Copy it now and give it to the agent; DocForge keeps only a fingerprint of it."
          onDone={() => setSecret(null)}
        />
      )}
      {revoking && (
        <ConfirmDialog
          title={`Revoke the key for ${revoking.name}?`}
          body="Agents using this key stop working at once. This cannot be undone; make a new key if you need one."
          action="Revoke key"
          onClose={() => setRevoking(null)}
          busy={busy}
          onConfirm={async () => {
            setBusy(true);
            try {
              await api(`/api-keys/${revoking.prefix}`, { method: "DELETE" });
              toast(`The key for ${revoking.name} is revoked.`);
              setRevoking(null);
              void load();
            } catch (caught) {
              setError(caught instanceof ApiError ? `The key was not revoked: ${caught.detail}` : "The key was not revoked. Try again.");
              setRevoking(null);
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
    </div>
  );
}
