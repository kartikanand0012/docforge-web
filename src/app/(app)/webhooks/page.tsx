"use client";

import { Plus, Webhook } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ConfirmDialog, SecretDialog } from "@/components/Dialog";
import { useToast } from "@/components/Toast";
import { Alert, Denied, EmptyPanel, Seg, StatusBadge, Tag, Time } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { localTime } from "@/lib/format";
import { DELIVERY_TEXT, maskedUrl, nextAttemptText } from "@/lib/webhooks";
import { useTitle } from "@/lib/useTitle";

type Webhook = {
  id: string; url: string; events: string[]; active: boolean; created_at: string; created_by: string;
  secret_rotated_at: string | null; last_delivery: { status: string; last_status: number | null; created_at: string } | null;
};  // prettier-ignore
type Delivery = {
  id: string; event_id: string; event_type: string; status: string; attempts: number; last_status: number | null;
  last_error: string | null; delivered_at: string | null; created_at: string; last_attempt_at: string | null; next_attempt_at: string | null;
};  // prettier-ignore
type Confirm = { kind: "rotate" | "delete"; hook: Webhook };

const MAX = 10;
const EVENT_TEXT: Record<string, string> = {
  "document.processed": "A document has been read and checked.",
  "document.ready_for_chat": "A document can now be searched and asked about.",
  "review.signed": "A person signed a document's record.",
  "webhook.test": "A test you send from this page.",
};
const STATUS_KIND: Record<string, "ok" | "fail" | "warn" | "neutral"> = { delivered: "ok", failed: "fail", pending: "warn" };

export default function WebhooksPage() {
  useTitle("Webhooks");
  const toast = useToast();
  const [hooks, setHooks] = useState<Webhook[] | null>(null);
  const [events, setEvents] = useState<string[]>([]);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [making, setMaking] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [secret, setSecret] = useState<{ title: string; value: string } | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);

  const load = useCallback(
    () =>
      Promise.all([api<Webhook[]>("/webhooks"), api<string[]>("/webhooks/events").catch(() => [] as string[])]).then(
        ([found, names]) => {
          setHooks(found);
          setEvents(names);
          setSelected((current) => (current && found.some((hook) => hook.id === current) ? current : (found[0]?.id ?? null)));
        },
        (caught: unknown) => {
          if (caught instanceof ApiError && caught.status === 403) setDenied(true);
          else setError(caught instanceof ApiError ? caught.detail : "Webhooks could not be loaded.");
        },
      ),
    [],
  );
  useEffect(() => {
    void load();
  }, [load]);

  if (denied) return <Denied />;

  const current = hooks?.find((hook) => hook.id === selected) ?? null;

  const toggle = async (hook: Webhook) => {
    try {
      await api(`/webhooks/${hook.id}`, { method: "PATCH", json: { active: !hook.active } });
      void load();
    } catch (caught) {
      toast(caught instanceof ApiError ? caught.detail : "It could not be changed.");
    }
  };
  const test = async (hook: Webhook) => {
    try {
      await api(`/webhooks/${hook.id}/test`, { method: "POST" });
      toast(`A test event is on its way to ${maskedUrl(hook.url)}.`);
    } catch (caught) {
      toast(caught instanceof ApiError && caught.status === 409 ? "Turn the webhook on before sending a test." : caught instanceof ApiError ? caught.detail : "The test could not be sent.");
    }
  };

  return (
    <div className="screen">
      <header className="screen-header">
        <div>
          <h1>Webhooks</h1>
          <p className="sub">Tell other systems when something happens. Every delivery is signed with the webhook&apos;s secret in the DocForge-Signature header.</p>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <span className="muted num">
            {hooks?.length ?? 0} of {MAX} webhooks
          </span>
          <button className="btn btn-secondary" onClick={() => setMaking(true)}>
            <Plus size={14} strokeWidth={1.5} aria-hidden="true" /> New webhook
          </button>
        </div>
      </header>
      <div className="screen-body">
        {error && <Alert kind="fail" title="Not loaded.">{error}</Alert>}
        {making && (
          <NewWebhook
            events={events}
            full={(hooks?.length ?? 0) >= MAX}
            onCancel={() => setMaking(false)}
            onMade={(made) => {
              setMaking(false);
              setSecret({ title: "Secret for the new webhook", value: made.secret });
              setSelected(made.id);
              void load();
            }}
          />
        )}
        {hooks && !hooks.length && !making && (
          <EmptyPanel
            icon={Webhook}
            title="No webhooks yet"
            text="Make one to tell your ERP or another system when a document is read, ready to ask about, or signed."
            action={
              <button className="btn btn-secondary" onClick={() => setMaking(true)}>
                New webhook
              </button>
            }
          />
        )}
        <div className="hook-grid">
          {hooks?.map((hook) => (
            <article key={hook.id} className="hook-card" data-selected={hook.id === selected ? "true" : undefined} onClick={() => setSelected(hook.id)}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                <button
                  type="button"
                  className="hook-select mono"
                  aria-pressed={hook.id === selected}
                  aria-label={`Show deliveries to ${maskedUrl(hook.url)}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    setSelected(hook.id);
                  }}
                >
                  {maskedUrl(hook.url)}
                </button>
                <button
                  className="switch"
                  role="switch"
                  aria-checked={hook.active}
                  aria-label={`Deliveries to ${maskedUrl(hook.url)}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    void toggle(hook);
                  }}
                >
                  <span className="switch-track" aria-hidden="true" />
                  {hook.active ? "On" : "Off"}
                </button>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {hook.events.map((event) => (
                  <Tag key={event} tone="neutral">
                    <span className="mono">{event}</span>
                  </Tag>
                ))}
              </div>
              <p style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 12.5 }}>
                {hook.last_delivery ? (
                  <>
                    <StatusBadge kind={STATUS_KIND[hook.last_delivery.status] ?? "neutral"}>
                      Last: {DELIVERY_TEXT[hook.last_delivery.status] ?? hook.last_delivery.status}
                    </StatusBadge>
                    <span className="muted">{localTime(hook.last_delivery.created_at)}</span>
                  </>
                ) : (
                  <span className="muted">Nothing sent yet</span>
                )}
                <span className="muted">· Secret: {hook.secret_rotated_at ? `new since ${localTime(hook.secret_rotated_at)}` : "the first one"}</span>
              </p>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }} onClick={(event) => event.stopPropagation()}>
                <button className="btn btn-secondary" aria-label={`Send a test to ${maskedUrl(hook.url)}`} onClick={() => void test(hook)}>
                  Send test
                </button>
                <button className="btn btn-secondary" aria-label={`Make a new secret for ${maskedUrl(hook.url)}`} onClick={() => setConfirm({ kind: "rotate", hook })}>
                  New secret…
                </button>
                <button className="btn btn-ghost btn-danger" aria-label={`Delete the webhook to ${maskedUrl(hook.url)}`} onClick={() => setConfirm({ kind: "delete", hook })}>
                  Delete
                </button>
              </div>
            </article>
          ))}
        </div>
        {current && <Deliveries hook={current} />}
      </div>

      {secret && (
        <SecretDialog
          title={secret.title}
          secret={secret.value}
          body="This is the only time the secret is shown. Give it to the receiving system: it checks every delivery's DocForge-Signature with it."
          onDone={() => setSecret(null)}
        />
      )}
      {confirm?.kind === "rotate" && (
        <ConfirmDialog
          title="Make a new secret?"
          body={`The old secret stops working now. Until the receiver at ${maskedUrl(confirm.hook.url)} has the new one, it will refuse deliveries as unsigned.`}
          action="Make a new secret"
          onClose={() => setConfirm(null)}
          onConfirm={async () => {
            const hook = confirm.hook;
            setConfirm(null);
            try {
              const made = await api<{ secret: string }>(`/webhooks/${hook.id}/secret`, { method: "POST" });
              setSecret({ title: `New secret for ${maskedUrl(hook.url)}`, value: made.secret });
              void load();
            } catch (caught) {
              toast(caught instanceof ApiError ? caught.detail : "A new secret could not be made.");
            }
          }}
        />
      )}
      {confirm?.kind === "delete" && (
        <ConfirmDialog
          title="Delete this webhook?"
          body={`Nothing more is sent to ${maskedUrl(confirm.hook.url)}. Its deliveries stay on record.`}
          action="Delete webhook"
          onClose={() => setConfirm(null)}
          onConfirm={async () => {
            const hook = confirm.hook;
            setConfirm(null);
            try {
              await api(`/webhooks/${hook.id}`, { method: "DELETE" });
              toast(`Webhook to ${maskedUrl(hook.url)} deleted.`);
            } catch (caught) {
              setError(caught instanceof ApiError ? `Not deleted: ${caught.detail}` : "The webhook was not deleted. Try again.");
            }
            void load();
          }}
        />
      )}
    </div>
  );
}

function NewWebhook({
  events, full, onCancel, onMade,
}: { events: string[]; full: boolean; onCancel: () => void; onMade: (made: { id: string; secret: string }) => void }) {  // prettier-ignore
  const [url, setUrl] = useState("https://");
  const [chosen, setChosen] = useState<Set<string>>(new Set(["document.processed"]));
  const [error, setError] = useState<string | null>(null);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (full) return setError("This organisation has 10 webhooks, the most allowed.");
    if (!chosen.size) return setError("Choose at least one event.");
    try {
      onMade(await api<{ id: string; secret: string }>("/webhooks", { method: "POST", json: { url: url.trim(), events: [...chosen] } }));
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 422) setError("Use an https address reachable from the internet. Private and local addresses are refused.");
      else if (caught instanceof ApiError && caught.status === 409) setError("This organisation has 10 webhooks, the most allowed.");
      else setError(caught instanceof ApiError ? caught.detail : "The webhook could not be made.");
    }
  };
  return (
    <form className="inline-form" onSubmit={submit} noValidate aria-label="New webhook" style={{ maxWidth: 640 }}>
      <div className="field">
        <label htmlFor="hook-url">Receiver address (https)</label>
        <input id="hook-url" className="input mono" type="url" value={url} onChange={(e) => setUrl(e.target.value)} autoFocus />
      </div>
      <fieldset style={{ border: 0, padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
        <legend className="label">Events</legend>
        {(events.length ? events : Object.keys(EVENT_TEXT)).map((name) => (
          <label key={name} className="check" style={{ alignItems: "flex-start" }}>
            <input
              type="checkbox"
              checked={chosen.has(name)}
              onChange={(e) =>
                setChosen((current) => {
                  const next = new Set(current);
                  if (e.target.checked) next.add(name);
                  else next.delete(name);
                  return next;
                })
              }
            />
            <span>
              <span className="mono" style={{ fontSize: 12.5 }}>{name}</span>
              <span className="muted" style={{ display: "block", fontSize: 12.5 }}>{EVENT_TEXT[name] ?? ""}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {error && (
        <p role="alert" className="reason-box reason-fail" style={{ fontSize: 13 }}>
          {error}
        </p>
      )}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary">
          Make webhook
        </button>
      </div>
    </form>
  );
}

function Deliveries({ hook }: { hook: Webhook }) {
  const toast = useToast();
  const [status, setStatus] = useState<"" | "failed" | "pending" | "delivered">("");
  const [rows, setRows] = useState<Delivery[]>([]);
  const [more, setMore] = useState(true);

  const page = useCallback(
    (before?: string) => {
      const params = new URLSearchParams({ limit: "25" });
      if (status) params.set("status", status);
      if (before) params.set("before", before);
      return api<Delivery[]>(`/webhooks/${hook.id}/deliveries?${params}`);
    },
    [hook.id, status],
  );
  useEffect(() => {
    let live = true;
    page().then(
      (found) => {
        if (!live) return;
        setRows(found);
        setMore(found.length === 25);
      },
      () => live && setRows([]),
    );
    return () => {
      live = false;
    };
  }, [page]);

  const resend = async (delivery: Delivery) => {
    try {
      await api(`/webhooks/${hook.id}/deliveries/${delivery.id}/resend`, { method: "POST" });
      toast("Sent again. It appears here as a new try.");
      setRows(await page());
    } catch (caught) {
      toast(caught instanceof ApiError ? caught.detail : "It could not be sent again.");
    }
  };

  const what = (delivery: Delivery) => {
    if (delivery.status === "delivered") return "The receiver accepted it.";
    if (delivery.status === "pending") return `Next try ${nextAttemptText(delivery.next_attempt_at)}.`;
    return delivery.last_error ?? "The receiver did not accept it.";
  };

  return (
    <section aria-labelledby="deliveries-title" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h2 id="deliveries-title" style={{ fontSize: 18 }}>
          Deliveries to <span className="mono">{maskedUrl(hook.url)}</span>
        </h2>
        <Seg
          name="delivery-status"
          label="Which deliveries"
          value={status}
          onChange={setStatus}
          options={[
            { value: "", label: "All" },
            { value: "failed", label: "Failed" },
            { value: "pending", label: "Retrying" },
            { value: "delivered", label: "Delivered" },
          ]}
        />
      </div>
      {rows.length ? (
        <div className="table-wrap">
          <table className="table" style={{ minWidth: 860 }}>
            <thead>
              <tr>
                <th scope="col">Event</th>
                <th scope="col">Status</th>
                <th scope="col" className="right">Tries</th>
                <th scope="col" className="right">Last answer</th>
                <th scope="col">What happened</th>
                <th scope="col">When</th>
                <th scope="col">
                  <span className="sr-only">Send again</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((delivery) => (
                <tr key={delivery.id}>
                  <td className="mono" style={{ fontSize: 12.5 }}>{delivery.event_type}</td>
                  <td>
                    <StatusBadge kind={STATUS_KIND[delivery.status] ?? "neutral"}>{delivery.status === "pending" ? "Retrying" : DELIVERY_TEXT[delivery.status] ?? delivery.status}</StatusBadge>
                  </td>
                  <td className="right num">{delivery.attempts}</td>
                  <td className="right num">{delivery.last_status ?? "—"}</td>
                  <td style={{ fontSize: 13 }}>{what(delivery)}</td>
                  <td className="num">
                    <Time iso={delivery.created_at} />
                  </td>
                  <td className="right">
                    {delivery.status === "failed" && (
                      <button className="btn btn-secondary" onClick={() => void resend(delivery)}>
                        Send again
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">No deliveries {status ? "like that " : ""}yet.</p>
      )}
      <p className="muted" style={{ fontSize: 12.5 }}>
        A 2xx answer counts as delivered. Anything else is retried for about half an hour with the same DocForge-Event-Id.
      </p>
      {more && rows.length > 0 && (
        <button
          className="btn btn-secondary"
          style={{ alignSelf: "center" }}
          onClick={async () => {
            const older = await page(rows.at(-1)?.id);
            setRows((current) => [...current, ...older]);
            setMore(older.length === 25);
          }}
        >
          Load more
        </button>
      )}
    </section>
  );
}
