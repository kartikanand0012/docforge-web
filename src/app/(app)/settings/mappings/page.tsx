"use client";

import Link from "next/link";
import { useState } from "react";
import { ImportMasters } from "@/components/mappings/ImportMasters";
import { MappingList } from "@/components/mappings/MappingList";
import { useCaller, useViewing } from "@/components/Shell";
import { mayMap, type MappingKind } from "@/lib/mappings";
import { useTitle } from "@/lib/useTitle";

const TABS: { id: MappingKind; label: string }[] = [
  { id: "suppliers", label: "Suppliers" },
  { id: "items", label: "Items" },
];

/** Settings › Mappings: the names this workspace's books use for each supplier and item. */
export default function MappingsPage() {
  useTitle("Tally / Marg names");
  const caller = useCaller();
  const viewing = useViewing();
  const mayChange = mayMap(caller.role, viewing);
  const [tab, setTab] = useState<MappingKind>("suppliers");

  return (
    <div className="screen">
      <header className="screen-header">
        <div>
          <p className="muted" style={{ fontSize: 13 }}>
            <Link href="/account">Settings</Link> › Mappings
          </p>
          <h1>Tally / Marg names</h1>
          <p className="sub">
            Map each supplier and item once to the name your books use, and exports never make a duplicate ledger.
            {mayChange ? "" : " Only someone who reviews bills can change them."}
          </p>
        </div>
        <Link className="btn btn-secondary" href="/exports">
          Export to Tally / Marg
        </Link>
      </header>
      <div className="screen-body" style={{ maxWidth: 960 }}>
        <div className="tabs" role="tablist" aria-label="Mappings">
          {TABS.map((candidate) => (
            <button
              key={candidate.id}
              role="tab"
              id={`mappings-tab-${candidate.id}`}
              aria-selected={tab === candidate.id}
              aria-controls="mappings-tabpanel"
              tabIndex={tab === candidate.id ? 0 : -1}
              className="tab"
              onClick={() => setTab(candidate.id)}
              onKeyDown={(event) => {
                if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
                const to = TABS[(TABS.findIndex((item) => item.id === candidate.id) + 1) % TABS.length];
                setTab(to.id);
                document.getElementById(`mappings-tab-${to.id}`)?.focus();
              }}
            >
              {candidate.label}
            </button>
          ))}
        </div>
        <div id="mappings-tabpanel" role="tabpanel" aria-labelledby={`mappings-tab-${tab}`}>
          <MappingList key={tab} kind={tab} mayChange={mayChange} />
        </div>
        {mayChange && <ImportMasters />}
      </div>
    </div>
  );
}
