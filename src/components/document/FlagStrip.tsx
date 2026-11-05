import Link from "next/link";
import { ReasonLine } from "@/components/ui";
import { nearExpirySentence } from "@/lib/flags";
import { h1Summary, nearExpirySummary, type Review } from "@/lib/review";

const SHOWN = 3; // near-expiry lines named; the rest are counted

const MATCHED = { irn: "same IRN", seller_and_number: "same seller GSTIN and invoice number" };

/** What was flagged on the bill, above its values: one sentence per flag. A possible duplicate
 * holds approval; near expiry and Schedule H1 are for information only. Nothing when nothing
 * was flagged, or the API is older. */
export function FlagStrip({ review }: { review: Review }) {
  const duplicates = review.duplicates ?? [];
  const window = review.near_expiry_months;
  // An API before the near-expiry list still has the rule's count.
  const nearExpiry = review.near_expiry ?? null;
  const nearExpiryCount = nearExpiry ? null : nearExpirySummary(review);
  const h1 = h1Summary(review);
  const hasNearExpiry = Boolean(nearExpiry?.length || nearExpiryCount);
  if (!duplicates.length && !hasNearExpiry && !h1) return null;
  const extra = (nearExpiry?.length ?? 0) - SHOWN;
  const forInformation = [hasNearExpiry && "near-expiry stock", h1 && "Schedule H1"].filter(Boolean).join(" and ");

  return (
    <div className="flag-strip" role="region" aria-label="Flagged on this bill">
      {duplicates.map((duplicate) => (
        <ReasonLine
          key={duplicate.document_id}
          kind="fail"
          label="Possible duplicate"
          box
          text={
            <>
              This bill may be a duplicate of <Link href={`/documents/${duplicate.document_id}`}>{duplicate.filename}</Link>:{" "}
              {MATCHED[duplicate.matched_on] ?? "same details"}.{review.review ? "" : " Approving it needs a reason."}
            </>
          }
        />
      ))}
      {nearExpiry?.slice(0, SHOWN).map((line) => <ReasonLine key={line.path} kind="warn" label="Near expiry" text={nearExpirySentence(line, window)} box />)}
      {extra > 0 && <p className="flag-more">And {extra === 1 ? "1 more near-expiry line" : `${extra} more near-expiry lines`}.</p>}
      {nearExpiryCount && <ReasonLine kind="warn" label="Near expiry" text={`${nearExpiryCount}.`} box />}
      {h1 && <ReasonLine kind="info" label="Schedule H1" text={`${h1}.`} box />}
      {forInformation && (
        <p className="muted flag-more">
          For your information: {forInformation} {forInformation.includes(" and ") ? "need" : "needs"} no override; approve as usual.
        </p>
      )}
    </div>
  );
}
