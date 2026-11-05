"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCaller, useViewing } from "@/components/Shell";
import { SplitReview } from "@/components/split/SplitReview";
import { mayGroup } from "@/lib/split";
import { useTitle } from "@/lib/useTitle";

/** Split Review: one file holding several invoices, its pages to be grouped by a person. */
export default function SplitReviewPage() {
  useTitle("Group pages");
  const { id } = useParams<{ id: string }>();
  const caller = useCaller();
  const viewing = useViewing();

  return (
    <div className="screen">
      <header className="screen-header">
        <div>
          <p className="muted" style={{ fontSize: 13 }}>
            <Link href="/splits">Split review</Link> › Group pages
          </p>
          <h1>Group the pages into invoices</h1>
          <p className="sub">Each group becomes one invoice, read and checked on its own. The original file is kept as it was uploaded.</p>
        </div>
        <Link className="btn btn-secondary" href={`/documents/${id}`}>
          Open the file
        </Link>
      </header>
      <div className="screen-body" style={{ maxWidth: 1100 }}>
        <SplitReview documentId={id} mayGroup={mayGroup(caller.role, viewing)} />
      </div>
    </div>
  );
}
