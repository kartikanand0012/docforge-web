"use client";

import Link from "next/link";
import { MargProfiles } from "@/components/profiles/MargProfiles";
import { useCaller, useViewing } from "@/components/Shell";
import { mayMap } from "@/lib/mappings";
import { useTitle } from "@/lib/useTitle";

/** Settings › Marg profile: the layout of the purchase import file this workspace's Marg
 * accepts, read from one it accepted. */
export default function MargProfilePage() {
  useTitle("Marg profile");
  const caller = useCaller();
  const viewing = useViewing();
  const mayChange = mayMap(caller.role, viewing);

  return (
    <div className="screen">
      <header className="screen-header">
        <div>
          <p className="muted" style={{ fontSize: 13 }}>
            <Link href="/account">Settings</Link> › Marg profile
          </p>
          <h1>Marg profile</h1>
          <p className="sub">
            The layout of the purchase import file your Marg accepts, read from one it accepted. Every change is a new version; past exports
            keep the version they used.{mayChange ? "" : " Only someone who reviews bills can change it."}
          </p>
        </div>
        <Link className="btn btn-secondary" href="/exports">
          Export to Tally / Marg
        </Link>
      </header>
      <div className="screen-body" style={{ maxWidth: 960 }}>
        <MargProfiles mayChange={mayChange} />
      </div>
    </div>
  );
}
