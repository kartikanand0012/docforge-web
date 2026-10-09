"use client";

import { forwardRef, useState } from "react";

const CELLS = 6;
// The API accepts PINs of six digits or more; the cells show six and grow for a longer one.
const MAX = 12;

type Props = { value: string; onChange: (value: string) => void; label: string; autoFocus?: boolean; invalid?: boolean };

/** Six cells over one real password input (handoff component 3). The PIN lives only in the
 * caller's state for the one request; it is never stored. */
export const PinInput = forwardRef<HTMLInputElement, Props>(function PinInput(
  { value, onChange, label, autoFocus, invalid },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const cells = Math.max(CELLS, Math.min(MAX, value.length + (value.length >= CELLS ? 1 : 0)));
  return (
    <div className="pin">
      {Array.from({ length: cells }, (_, i) => (
        <span key={i} className="pin-cell" data-current={focused && i === Math.min(value.length, cells - 1)} aria-hidden="true">
          {i < value.length ? "•" : ""}
        </span>
      ))}
      <input
        ref={ref}
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={MAX}
        aria-label={label}
        aria-invalid={invalid || undefined}
        autoFocus={autoFocus}
        value={value}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(event) => onChange(event.target.value.replace(/\D/g, "").slice(0, MAX))}
      />
    </div>
  );
});
