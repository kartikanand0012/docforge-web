"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

type ToastAction = { label: string; onClick: () => void };
type Toast = { id: number; text: ReactNode; action?: ToastAction };
type Show = (text: ReactNode, action?: ToastAction) => void;

const ToastContext = createContext<Show>(() => {});
const SHOWN_FOR = 6000;

/** Toasts confirm what was done (component 15); errors that need reading are alerts instead. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback<Show>((text, action) => {
    if (timer.current) clearTimeout(timer.current);
    const id = Date.now();
    setToast({ id, text, action });
    timer.current = setTimeout(() => setToast((current) => (current?.id === id ? null : current)), SHOWN_FOR);
  }, []);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div role="status" aria-live="polite" className={toast ? "toast" : "sr-only"}>
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
          </>
        )}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): Show {
  return useContext(ToastContext);
}
