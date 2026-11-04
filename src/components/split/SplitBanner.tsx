"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getSplit, pagesWord, splitPath, type Split } from "@/lib/split";

type Doc = { id: string; status: string; parent_document_id?: string | null; parent_pages?: number[] | null };

/** On a document's page: a file divided into its invoices links to them; one waiting for its
 * pages to be grouped links to Split Review; an invoice cut from a file links back to it. */
export function SplitBanner({ document }: { document: Doc }) {
  const divided = document.status === "split" || document.status === "split_review";
  const [split, setSplit] = useState<Split | null>(null);

  useEffect(() => {
    if (!divided) return;
    let live = true;
    getSplit(document.id).then(
      (found) => live && setSplit(found),
      () => live && setSplit(null),
    );
    return () => {
      live = false;
    };
  }, [divided, document.id, document.status]);

  if (document.parent_document_id && document.parent_pages) {
    return (
      <div className="offline-strip" role="note">
        <p>
          This invoice is {pagesWord(document.parent_pages)} of a file that held several.{" "}
          <Link href={`/documents/${document.parent_document_id}`}>Open the original file</Link>
        </p>
      </div>
    );
  }
  if (document.status === "split_review") {
    return (
      <div className="offline-strip" role="status">
        <p>
          <b>This file holds several invoices.</b> {split?.reason ? `DocForge was not sure where they divide: ${split.reason}. ` : ""}
          Nothing is read until someone confirms how its pages group.{" "}
          <Link href={splitPath(document.id)}>Group its pages</Link>
        </p>
      </div>
    );
  }
  if (document.status === "split" && split) {
    return (
      <div className="offline-strip" role="status">
        <p>
          <b>Split into {split.counts.invoices} invoices.</b> This file is kept as it was uploaded; each invoice is read on its own:{" "}
          {split.groups.map((group, index) => (
            <span key={group.document_id ?? index}>
              {index > 0 && " · "}
              <Link href={`/documents/${group.document_id}`}>
                Invoice {index + 1} ({pagesWord(group.pages)})
              </Link>
            </span>
          ))}
          {split.non_invoice.length > 0 && <> · {pagesWord(split.non_invoice)} not an invoice</>}
        </p>
      </div>
    );
  }
  return null;
}
