"use client";

import { useEffect } from "react";

/** Each screen names itself in the tab, history and the screen reader's route announcement
 * (WCAG 2.4.2): "Review queue · DocForge". */
export function useTitle(title: string | null | undefined): void {
  useEffect(() => {
    if (title) document.title = `${title} · DocForge`;
  }, [title]);
}
