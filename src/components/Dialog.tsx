"use client";

import { AlertTriangle } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

type DialogProps = {
  title: ReactNode;
  kicker?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  role?: "dialog" | "alertdialog";
  width?: number;
  actions?: ReactNode;
  /** False for content that must not be lost by a stray Escape or click outside. */
  dismissable?: boolean;
};

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** A modal dialog: focus kept inside, Escape closes it, focus goes back to what opened it. */
export function Dialog({ title, kicker, onClose, children, role = "dialog", width = 480, actions, dismissable = true }: DialogProps) {
  const panel = useRef<HTMLDivElement>(null);
  // What had focus before the dialog, read while rendering: a child with autoFocus takes
  // focus before any effect runs, so an effect would find the child instead.
  const [opener] = useState(() => (typeof document === "undefined" ? null : (document.activeElement as HTMLElement | null)));
  const canDismiss = useRef(dismissable);
  useEffect(() => {
    canDismiss.current = dismissable;
  }, [dismissable]);
  const titleId = useId();
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const node = panel.current;
    if (node && !node.contains(document.activeElement)) {
      (node.querySelector<HTMLElement>("[autofocus], [data-autofocus]") ?? node.querySelector<HTMLElement>(FOCUSABLE) ?? node).focus();
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        if (canDismiss.current) close.current();
        return;
      }
      if (event.key !== "Tab" || !node) return;
      const items = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      // Focus on the panel itself, or lost outside it, is brought back in.
      if (!node.contains(document.activeElement) || document.activeElement === node) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      opener?.focus?.();
    };
  }, [opener]);

  return (
    <div className="dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && dismissable && onClose()}>
      <div ref={panel} className="dialog" role={role} aria-modal="true" aria-labelledby={titleId} tabIndex={-1} style={{ width: `min(${width}px, 100%)` }}>
        {kicker && <p className="group-label" style={{ fontSize: 11 }}>{kicker}</p>}
        <h2 id={titleId} className="dialog-title">
          {title}
        </h2>
        {children}
        {actions && <div className="dialog-actions">{actions}</div>}
      </div>
    </div>
  );
}

/** A secret shown once (component 17): never stored; Copy focused on open. */
export function SecretDialog({ title, secret, body, onDone }: { title: ReactNode; secret: string; body?: ReactNode; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <Dialog
      title={title}
      onClose={onDone}
      dismissable={false}
      actions={
        <button className="btn btn-primary" onClick={onDone}>
          Done, I have copied it
        </button>
      }
    >
      <p>{body ?? "This is the only time it is shown. Copy it now and keep it somewhere safe."}</p>
      <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
        <code className="secret" style={{ flex: 1 }}>
          {secret}
        </code>
        <button className="btn btn-secondary" onClick={copy} data-autofocus>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="reason reason-warn">
        <AlertTriangle strokeWidth={1.5} aria-hidden="true" />
        <span>It is not stored in DocForge in readable form and cannot be shown again.</span>
      </p>
    </Dialog>
  );
}

type ConfirmProps = {
  title: ReactNode;
  body: ReactNode;
  action: string;
  onConfirm: () => void;
  onClose: () => void;
  destructive?: boolean;
  busy?: boolean;
};

export function ConfirmDialog({ title, body, action, onConfirm, onClose, destructive = true, busy = false }: ConfirmProps) {
  return (
    <Dialog
      title={title}
      role="alertdialog"
      onClose={onClose}
      width={440}
      actions={
        <>
          <button className="btn btn-secondary" onClick={onClose} data-autofocus>
            Cancel
          </button>
          <button className={`btn btn-primary${destructive ? " btn-danger" : ""}`} onClick={onConfirm} disabled={busy}>
            {action}
          </button>
        </>
      }
    >
      <p>{body}</p>
    </Dialog>
  );
}
