"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Marks } from "@/components/ui";
import { signUpError, validSignUp } from "@/lib/signin";
import { useTitle } from "@/lib/useTitle";

export default function SignUpPage() {
  useTitle("Create an account");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [shown, setShown] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const invalid = validSignUp({ name, email, password });
    if (invalid) return setError(invalid);
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), password }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { detail?: string | null };
        const retry = Number(response.headers.get("retry-after"));
        return setError(signUpError(response.status, body.detail ?? null, Number.isFinite(retry) && retry > 0 ? retry : null));
      }
      // A full load on purpose: the signed-in layout reads the new session from the cookie.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/upload");
    } catch {
      setError(signUpError(503, null, null));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="signin blueprint-grid">
      <form className="signin-card marked" onSubmit={submit} noValidate aria-describedby={error ? "signup-error" : "signup-note"}>
        <Marks />
        <Link href="/" style={{ fontSize: 15, fontWeight: 600, color: "var(--color-accent-700)", textDecoration: "none" }}>
          DocForge
        </Link>
        <h1 style={{ fontSize: 26 }}>Create a free account</h1>
        <p id="signup-note" className="muted" style={{ fontSize: 13 }}>
          You get a private workspace: up to 30 documents, visible only to you. Documents are read with Google Gemini, so upload samples rather than confidential papers.
        </p>
        <div className="field">
          <label htmlFor="name">Your name</label>
          <input id="name" className="input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={120} />
        </div>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={320} />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              id="password"
              className="input"
              type={shown ? "text" : "password"}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              maxLength={128}
              aria-describedby="password-hint"
            />
            <button type="button" className="btn btn-secondary" onClick={() => setShown((now) => !now)} aria-pressed={shown}>
              {shown ? "Hide" : "Show"}
            </button>
          </div>
          <span id="password-hint" className="muted" style={{ fontSize: 12 }}>
            At least 10 characters. You also enter it to sign an approval.
          </span>
        </div>
        {error && (
          <p id="signup-error" role="alert" className="reason-box reason-fail" style={{ fontSize: 13 }}>
            {error}
          </p>
        )}
        <button className="btn btn-primary btn-block marked" type="submit" disabled={busy}>
          <Marks />
          {busy ? "Creating your workspace…" : "Create account"}
        </button>
        <p className="muted" style={{ fontSize: 13, textAlign: "center" }}>
          Already have an account? <Link href="/login">Sign in</Link>
        </p>
      </form>
    </main>
  );
}
