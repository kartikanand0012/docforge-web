"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { IntakeMessages } from "@/components/intake/IntakeMessages";
import { useCaller, useViewing } from "@/components/Shell";
import { SETTINGS_PATH, VIEWS, mayDecide, type IntakeView } from "@/lib/intake";
import { useTitle } from "@/lib/useTitle";

export default function IntakePage() {
  return (
    <Suspense fallback={<div className="screen" aria-busy="true" />}>
      <Intake />
    </Suspense>
  );
}

/** Mail received: every mail sent to the workspace's address, newest first, and what became of
 * each attachment. The view is kept in the address so it can be linked to. */
function Intake() {
  useTitle("Mail received");
  const caller = useCaller();
  const viewing = useViewing();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const asked = search.get("view");
  const view: IntakeView = VIEWS.some((option) => option.value === asked) ? (asked as IntakeView) : "all";

  const setView = (next: IntakeView) => router.replace(next === "all" ? pathname : `${pathname}?view=${next}`);

  return (
    <div className="screen">
      <header className="screen-header">
        <div>
          <p className="muted" style={{ fontSize: 13 }}>
            <Link href="/documents">Documents</Link> › Mail received
          </p>
          <h1>Mail received</h1>
          <p className="sub">Bills forwarded to your workspace&apos;s address, newest first, with what became of each attachment.</p>
        </div>
        <Link className="btn btn-secondary" href={SETTINGS_PATH}>
          Email intake settings
        </Link>
      </header>
      <div className="screen-body" style={{ maxWidth: 960 }}>
        <IntakeMessages view={view} onView={setView} mayDecide={mayDecide(caller.role, viewing)} />
      </div>
    </div>
  );
}
