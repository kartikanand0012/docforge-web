"use client";

import Link from "next/link";
import { IntakeSetup } from "@/components/intake/IntakeSetup";
import { useCaller, useViewing } from "@/components/Shell";
import { LIST_PATH, mayChangeIntake, mayDecide } from "@/lib/intake";
import { useTitle } from "@/lib/useTitle";

/** Settings › Email intake: the workspace's forwarding address, who may send bills to it, its
 * limits and a test mail. */
export default function IntakeSettingsPage() {
  useTitle("Email intake");
  const caller = useCaller();
  const viewing = useViewing();
  const mayChange = mayChangeIntake(caller.role, viewing);

  return (
    <div className="screen">
      <header className="screen-header">
        <div>
          <p className="muted" style={{ fontSize: 13 }}>
            <Link href="/account">Settings</Link> › Email intake
          </p>
          <h1>Email intake</h1>
          <p className="sub">
            Forward bills to your workspace&apos;s own address instead of uploading them.
            {mayChange ? "" : " Only an administrator can change these settings."}
          </p>
        </div>
        <Link className="btn btn-secondary" href={LIST_PATH}>
          Mail received
        </Link>
      </header>
      <div className="screen-body" style={{ maxWidth: 820 }}>
        <IntakeSetup mayChange={mayChange} mayDecide={mayDecide(caller.role, viewing)} />
      </div>
    </div>
  );
}
