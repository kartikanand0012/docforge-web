"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Marks } from "@/components/ui";
import type { DemoAccount } from "@/lib/demo";
import { safeNext } from "@/lib/next";
import { signInError, validSignIn } from "@/lib/signin";

export default function LoginPage() {
  const [tenant, setTenant] = useState("");
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<{ kind: "fail" | "warn"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [demo, setDemo] = useState<DemoAccount | null>(null);

  // A public demo offers its shared account; elsewhere this answers 404 and nothing shows.
  useEffect(() => {
    fetch("/api/demo", { cache: "no-store" })
      .then((response) => (response.ok ? (response.json() as Promise<DemoAccount>) : null))
      .then(setDemo, () => setDemo(null));
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const invalid = validSignIn({ tenant, email, pin });
    if (invalid) return setError({ kind: "fail", text: invalid });
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenant: tenant.trim(), email: email.trim(), pin }),
      });
      if (!response.ok) {
        setPin("");
        const retry = Number(response.headers.get("retry-after"));
        return setError(signInError(response.status, Number.isFinite(retry) && retry > 0 ? retry : null));
      }
      const next = safeNext(new URLSearchParams(window.location.search).get("next"), window.location.origin);
      window.location.assign(next);
    } catch {
      setError(signInError(503, null));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="signin blueprint-grid">
      <form className="signin-card marked" onSubmit={submit} noValidate aria-describedby={error ? "signin-error" : undefined}>
        <Marks />
        <p style={{ fontSize: 15, fontWeight: 600, color: "var(--color-accent-700)" }}>DocForge</p>
        <h1 style={{ fontSize: 26 }}>Sign in</h1>
        {demo && (
          <div className="reason-box reason-info" style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
            <p>
              <b>Try the demo.</b> Organisation <span className="mono">{demo.organisation}</span>, email{" "}
              <span className="mono">{demo.email}</span>, PIN <span className="mono">{demo.pin}</span>. It reads recorded sample documents.
            </p>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ alignSelf: "flex-start" }}
              onClick={() => {
                setTenant(demo.organisation);
                setEmail(demo.email);
                setPin(demo.pin);
              }}
            >
              Fill in the demo account
            </button>
          </div>
        )}
        <div className="field">
          <label htmlFor="tenant">Organisation</label>
          <input id="tenant" className="input" autoComplete="organization" value={tenant} onChange={(e) => setTenant(e.target.value)} autoFocus />
        </div>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="pin">PIN</label>
          <input
            id="pin"
            className="input pin-field num"
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            maxLength={12}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          />
        </div>
        {error && (
          <p id="signin-error" role="alert" className={`reason-box reason-${error.kind}`} style={{ fontSize: 13 }}>
            {error.text}
          </p>
        )}
        <button className="btn btn-primary btn-block marked" type="submit" disabled={busy}>
          <Marks />
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <p className="muted" style={{ fontSize: 12.5, textAlign: "center" }}>
          You stay signed in for 8 hours.
        </p>
      </form>
    </main>
  );
}
