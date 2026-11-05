"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { BatchView } from "@/components/batches/BatchView";
import { useCaller, useViewing } from "@/components/Shell";
import { useTitle } from "@/lib/useTitle";

/** A batch: files dropped together, or a ZIP, each its own document, counted live. */
export default function BatchPage() {
  useTitle("Batch");
  const { id } = useParams<{ id: string }>();
  const caller = useCaller();
  const viewing = useViewing();
  const mayRetry = !viewing && ["admin", "member", "integrator"].includes(caller.role);

  return (
    <div className="screen">
      <header className="screen-header">
        <div>
          <p className="muted" style={{ fontSize: 13 }}>
            <Link href="/upload">Upload</Link> › Batch
          </p>
          <h1>Batch</h1>
          <p className="sub">Every file of the batch and what became of it. Files keep being read if you leave this page.</p>
        </div>
      </header>
      <div className="screen-body" style={{ maxWidth: 960 }}>
        <BatchView id={id} mayRetry={mayRetry} />
      </div>
    </div>
  );
}
