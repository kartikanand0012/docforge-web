"use client";

import { X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

type ToastAction = { label: string; onClick: () => void };
type Toast = { id: number; text: ReactNode; action?: ToastAction };
type Show = (text: ReactNode, action?: ToastAction) => void;

const ToastContext = createContext<Show>(() => {});
const SHOWN_FOR = 6000;

/** Toasts confirm what was done (component 15); errors that need reading are alerts instead.
 * One with an action ("Open next") stays until used or closed, so a keyboard user can reach
 * it; any toast waits while the pointer or focus is on it (WCAG 2.2.1). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const start = useCallback((current: Toast) => {
    if (timer.current) clearTimeout(timer.current);
    if (current.action) return; // stays until used or closed
    timer.current = setTimeout(() => setToast((shown) => (shown?.id === current.id ? null : shown)), SHOWN_FOR);
  }, []);
  const show = useCallback<Show>(
    (text, action) => {
      const next = { id: Date.now(), text, action };
      setToast(next);
      start(next);
    },
    [start],
  );
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className={toast ? "toast" : "sr-only"}
        onMouseEnter={stop}
        onMouseLeave={() => toast && start(toast)}
        onFocus={stop}
        onBlur={() => toast && start(toast)}
      >
        {toast && (
          <>
            <span>{toast.text}</span>
            {toast.action && (
              <button
                className="btn"
                onClick={() => {
                  toast.action?.onClick();
                  setToast(null);
                }}
              >
                {toast.action.label}
              </button>
            )}
            <button className="btn toast-close" aria-label="Close the message" onClick={() => setToast(null)}>
              <X size={14} strokeWidth={1.5} aria-hidden="true" />
            </button>
          </>
        )}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): Show {
  return useContext(ToastContext);
}
