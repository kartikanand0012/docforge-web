"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { ConfirmDialog } from "@/components/Dialog";
import { MessageCard } from "@/components/intake/MessageCard";
import { Alert, Time } from "@/components/ui";
import { ApiError } from "@/lib/api";
import {
  LIST_PATH, MAX_HOURLY, addSender, changeIntakeSettings, getIntakeSettings, listMessages, makeAddress, removeSender, sendTest, settled,
  type IntakeMessage, type IntakeSender, type IntakeSettings,
} from "@/lib/intake";  // prettier-ignore

const failed = (caught: unknown, fallback: string) => (caught instanceof ApiError ? caught.detail : fallback);

/** How often, and how many times, the test mail is looked for while it is read. */
export const POLL_MS = 2000;
export const POLL_TRIES = 15;

/** Settings › Email intake: the address, the senders, the limits and a test mail. */
export function IntakeSetup({ mayChange, mayDecide }: { mayChange: boolean; mayDecide: boolean }) {
  const [settings, setSettings] = useState<IntakeSettings | null>(null);
  const [loadError, setLoadError] = useState<{ status: number; detail: string } | null>(null);

  useEffect(() => {
    let live = true;
    getIntakeSettings().then(
      (found) => live && setSettings(found),
      (caught: unknown) =>
        live && setLoadError({ status: caught instanceof ApiError ? caught.status : 0, detail: failed(caught, "Email intake could not be loaded.") }),
    );
    return () => {
      live = false;
    };
  }, []);

  if (loadError?.status === 403) {
    return (
      <Alert kind="info" title="Only an administrator can set up email intake.">
        You can see the mail received, and what became of each attachment, in <Link href={LIST_PATH}>Mail received</Link>.
      </Alert>
    );
  }
  if (loadError) {
    return (
      <Alert kind="fail" title="Not loaded.">
        {loadError.detail}
      </Alert>
    );
  }
  if (!settings) return <p className="muted">Loading…</p>;

  if (!settings.enabled) {
    return (
      <Alert kind="info" title="Email intake is not set up on this server yet.">
        Whoever runs this DocForge server needs to give it a mail domain first. Until then, upload bills on the Upload screen.
      </Alert>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <AddressCard settings={settings} mayChange={mayChange} onChanged={setSettings} />
      <SenderList settings={settings} mayChange={mayChange} onChanged={setSettings} />
      <Limits settings={settings} mayChange={mayChange} onChanged={setSettings} />
      {mayChange && <TestMail hasAddress={settings.address !== null} mayDecide={mayDecide} />}
    </div>
  );
}

type Part = { settings: IntakeSettings; mayChange: boolean; onChanged: (settings: IntakeSettings) => void };

function AddressCard({ settings, mayChange, onChanged }: Part) {
  const id = useId();
  const [fresh, setFresh] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const make = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const made = await makeAddress();
      setFresh(made.address?.whole ? made.address.address : null);
      setCopied(false);
      onChanged(made);
    } catch (caught) {
      setError(failed(caught, "No address was made. Try again."));
    } finally {
      setBusy(false);
      setAsking(false);
    }
  };

  const copy = async () => {
    if (!fresh) return;
    try {
      await navigator.clipboard.writeText(fresh);
      setCopied(true);
    } catch {
      setCopied(false);
      setError("It could not be copied. Select the address and copy it by hand.");
    }
  };

  /** The whole address leaves the page: the settings are read again, so it shows masked. */
  const hide = () => {
    setFresh(null);
    getIntakeSettings().then(onChanged, () => undefined);
  };

  const address = settings.address;
  return (
    <section className="section-card" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} style={{ fontSize: 18 }}>
        Your forwarding address
      </h2>
      <p>
        Forward a supplier&apos;s bill to this address and it is read exactly as an upload is. Each attached file becomes one document. A
        sender on your list gets a short reply saying what became of each attachment.
      </p>
      {fresh ? (
        <div className="intake-fresh">
          <div style={{ display: "flex", gap: 8, alignItems: "stretch", flexWrap: "wrap" }}>
            <code className="secret" style={{ flex: 1 }} aria-label="The new address">
              {fresh}
            </code>
            <button className="btn btn-secondary" onClick={() => void copy()}>
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <Alert kind="warn" title="Copy it now: for safety it is shown only once.">
            DocForge does not keep it in readable form; after you leave this page it is shown hidden. If it is lost, make a new one.
          </Alert>
          <div>
            <button className="btn btn-ghost" onClick={hide}>
              Done, I have copied it
            </button>
          </div>
        </div>
      ) : address ? (
        <p>
          {/* Never the whole address outside the moment it was made. */}
          <code className="intake-masked">{address.whole ? "Hidden" : address.address}</code>
          <span className="muted" style={{ fontSize: 13 }}>
            {" "}
            · made by {address.created_by}, <Time iso={address.created_at} /> · hidden: it was shown once, when it was made
          </span>
        </p>
      ) : (
        <p className="muted">No address yet.{mayChange ? "" : " An administrator can make one."}</p>
      )}
      {mayChange && (
        <div>
          <button
            className={address ? "btn btn-secondary" : "btn btn-primary"}
            onClick={() => (address ? setAsking(true) : void make())}
            disabled={busy}
          >
            {busy ? "Making…" : address ? "Make a new address…" : "Make the address"}
          </button>
        </div>
      )}
      {error && (
        <Alert kind="fail" title="Not done.">
          {error}
        </Alert>
      )}
      {asking && (
        <ConfirmDialog
          title="Make a new address?"
          body="The old address stops working at once: mail sent to it makes nothing and gets no reply. Give the new address to everyone who forwards bills."
          action="Make a new address"
          busy={busy}
          onConfirm={() => void make()}
          onClose={() => setAsking(false)}
        />
      )}
    </section>
  );
}

function SenderList({ settings, mayChange, onChanged }: Part) {
  const id = useId();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  const add = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (!value.trim()) return setError("Enter an address, such as asha@supplier.in, or a domain, such as @supplier.in.");
    setBusy(true);
    setError(null);
    try {
      const added = await addSender(value);
      onChanged({ ...settings, senders: [...settings.senders.filter((s) => s.id !== added.id), added] });
      setValue("");
    } catch (caught) {
      setError(failed(caught, "The sender was not added. Try again."));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (sender: IntakeSender) => {
    if (removing) return;
    setRemoving(sender.id);
    setError(null);
    try {
      await removeSender(sender.id);
      onChanged({ ...settings, senders: settings.senders.filter((s) => s.id !== sender.id) });
    } catch (caught) {
      setError(failed(caught, "The sender was not removed. Try again."));
    } finally {
      setRemoving(null);
    }
  };

  return (
    <section className="section-card" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} style={{ fontSize: 18 }}>
        Who may send bills
      </h2>
      <p>
        Mail from these senders is read straight away. Mail from anyone else is held in <Link href={LIST_PATH}>Mail received</Link> until
        someone who reviews bills accepts or discards it; it is never read or deleted by itself.
      </p>
      {settings.senders.length === 0 ? (
        <p className="muted">No senders yet: every mail is held for review.</p>
      ) : (
        <ul className="intake-senders" aria-label="Senders">
          {settings.senders.map((sender) => (
            <li key={sender.id}>
              <span style={{ overflowWrap: "anywhere" }}>
                <b>{sender.sender}</b>{" "}
                <span className="muted" style={{ fontSize: 12.5 }}>
                  {sender.sender.startsWith("@") ? "everyone at this domain" : "this address"} · added by {sender.created_by}
                </span>
              </span>
              {mayChange && (
                <button
                  className="btn btn-ghost btn-danger"
                  onClick={() => void remove(sender)}
                  disabled={removing !== null}
                  aria-label={`Remove ${sender.sender}`}
                >
                  {removing === sender.id ? "Removing…" : "Remove"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {mayChange && (
        <form onSubmit={add} noValidate style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div className="field" style={{ flex: "1 1 260px" }}>
            <label htmlFor={`${id}-sender`}>An address or @domain</label>
            <input
              id={`${id}-sender`}
              className="input"
              type="text"
              inputMode="email"
              autoComplete="off"
              placeholder="asha@supplier.in or @supplier.in"
              value={value}
              maxLength={254}
              onChange={(event) => setValue(event.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${id}-error` : undefined}
            />
          </div>
          <button type="submit" className="btn btn-secondary" disabled={busy}>
            {busy ? "Adding…" : "Add sender"}
          </button>
        </form>
      )}
      {error && (
        <Alert kind="fail" title="Not done.">
          <span id={`${id}-error`}>{error}</span>
        </Alert>
      )}
    </section>
  );
}

function Limits({ settings, mayChange, onChanged }: Part) {
  const id = useId();
  const [hourly, setHourly] = useState(String(settings.per_sender_hourly));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const save = async (change: { trust_accepted?: boolean; per_sender_hourly?: number }, words: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      const changed = await changeIntakeSettings(change);
      onChanged(changed);
      setHourly(String(changed.per_sender_hourly));
      setSaved(words);
    } catch (caught) {
      setError(failed(caught, "The setting was not saved. Try again."));
    } finally {
      setBusy(false);
    }
  };

  const submitHourly = (event: FormEvent) => {
    event.preventDefault();
    const value = Number(hourly.trim());
    if (!/^\d+$/.test(hourly.trim()) || value < 1 || value > MAX_HOURLY) {
      return setError(`Enter a whole number from 1 to ${MAX_HOURLY.toLocaleString("en-IN")}.`);
    }
    if (value === settings.per_sender_hourly) return setSaved("Nothing to change.");
    void save({ per_sender_hourly: value }, `Saved: at most ${value} documents an hour from one sender.`);
  };

  return (
    <section className="section-card" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} style={{ fontSize: 18 }}>
        Limits
      </h2>
      {mayChange ? (
        <>
          <label className="check">
            <input
              type="checkbox"
              checked={settings.trust_accepted}
              disabled={busy}
              onChange={(event) =>
                void save(
                  { trust_accepted: event.target.checked },
                  event.target.checked ? "Saved: a sender is trusted once a held mail is accepted." : "Saved: accepting a held mail no longer trusts its sender.",
                )
              }
            />
            Trust a sender once a held mail is accepted
          </label>
          <p className="muted" style={{ fontSize: 13 }}>
            When on, accepting a held mail adds its sender to the list above. Off by default: a sender&apos;s address can be faked.
          </p>
          <form onSubmit={submitHourly} noValidate style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div className="field">
              <label htmlFor={`${id}-hourly`}>Documents an hour from one sender</label>
              <input
                id={`${id}-hourly`}
                className="input num"
                inputMode="numeric"
                value={hourly}
                onChange={(event) => setHourly(event.target.value)}
                style={{ width: 120 }}
              />
            </div>
            <button type="submit" className="btn btn-secondary" disabled={busy}>
              Save
            </button>
          </form>
          <p className="muted" style={{ fontSize: 13 }}>
            More than this in an hour from one sender is held for review.
          </p>
        </>
      ) : (
        <p>
          Trust a sender once a held mail is accepted: <b>{settings.trust_accepted ? "On" : "Off"}</b> · Documents an hour from one sender:{" "}
          <b>{settings.per_sender_hourly}</b>
          <span className="muted"> · only an administrator can change them</span>
        </p>
      )}
      <div aria-live="polite">{saved && <p className="muted">{saved}</p>}</div>
      {error && (
        <Alert kind="fail" title="Not saved.">
          {error}
        </Alert>
      )}
    </section>
  );
}

/** Sends a made-up bill through intake and shows it arriving. */
function TestMail({ hasAddress, mayDecide }: { hasAddress: boolean; mayDecide: boolean }) {
  const id = useId();
  const [message, setMessage] = useState<IntakeMessage | null>(null);
  const [watching, setWatching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);  // prettier-ignore

  const watch = (sent: IntakeMessage, tries: number) => {
    if (settled(sent) || tries >= POLL_TRIES) return setWatching(false);
    setWatching(true);
    timer.current = setTimeout(() => {
      listMessages("all", 5).then(
        (found) => {
          const now = found.find((candidate) => candidate.id === sent.id) ?? sent;
          setMessage(now);
          watch(now, tries + 1);
        },
        () => watch(sent, tries + 1),
      );
    }, POLL_MS);
  };

  const send = async () => {
    if (busy) return;
    if (timer.current) clearTimeout(timer.current);
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const sent = await sendTest();
      setMessage(sent);
      watch(sent, 0);
    } catch (caught) {
      setError(failed(caught, "The test was not sent. Try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="section-card" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} style={{ fontSize: 18 }}>
        Try it
      </h2>
      <p>
        Puts a made-up sample bill through email intake, as if a supplier had forwarded it, so you can watch it arrive in Mail received and
        in Documents.{hasAddress ? "" : " Make the address first."}
      </p>
      <div>
        <button className="btn btn-secondary" onClick={() => void send()} disabled={busy}>
          {busy ? "Sending…" : "Send a test invoice"}
        </button>
      </div>
      {error && (
        <Alert kind="fail" title="Not sent.">
          {error}
        </Alert>
      )}
      <div aria-live="polite">
        {message && (
          <>
            <p className="muted">{watching ? "Arrived. Watching it being read…" : "Arrived."}</p>
            <ul className="intake-messages">
              <MessageCard message={message} mayDecide={mayDecide} onChanged={setMessage} />
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
