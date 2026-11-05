"use client";

import Link from "next/link";
import { Exports } from "@/components/exports/Exports";
import { PoVarianceReport } from "@/components/exports/PoVarianceReport";
import { PurchaseRegister } from "@/components/exports/PurchaseRegister";
import { useCaller, useViewing } from "@/components/Shell";
import { mayMap } from "@/lib/mappings";
import { useTitle } from "@/lib/useTitle";

export default function ExportsPage() {
  useTitle("Export to Tally / Marg");
  const caller = useCaller();
  const viewing = useViewing();

  return (
    <div className="screen">
      <header className="screen-header">
        <div>
          <h1>Export to Tally / Marg</h1>
          <p className="sub">
            Approved bills as a file for your books, under the names your books already use. Anything not yet mapped stops the export and is
            listed here to map once. Below, a month&apos;s purchase register as Excel for your CA, and the month&apos;s bills against their
            purchase orders in rupees.
          </p>
        </div>
        <Link className="btn btn-secondary" href="/settings/mappings">
          Tally / Marg names
        </Link>
      </header>
      <div className="screen-body" style={{ maxWidth: 960, display: "flex", flexDirection: "column", gap: 24 }}>
        <Exports mayMap={mayMap(caller.role, viewing)} />
        <PurchaseRegister />
        <PoVarianceReport />
      </div>
    </div>
  );
}
