import { AlertTriangle, ShieldCheck, ShieldX } from "lucide-react";
import { einvoiceBanner, type Einvoice } from "@/lib/einvoice";

const ICONS = { ok: ShieldCheck, warn: AlertTriangle, fail: ShieldX };

/** What the invoice's signed e-invoice QR says, above its values; nothing without one. */
export function EinvoiceBanner({ einvoice }: { einvoice: Einvoice | null | undefined }) {
  const banner = einvoiceBanner(einvoice);
  if (!banner) return null;
  const Icon = ICONS[banner.kind];
  const signed = einvoice?.signed;
  return (
    <div className={`alert alert-${banner.kind} einvoice-banner`} role="region" aria-label="E-invoice QR">
      <Icon strokeWidth={1.5} aria-hidden="true" />
      <div>
        <p>
          <b>{banner.title}</b>
        </p>
        {banner.lines.map((line) => (
          <p key={line} style={{ fontSize: 13 }}>
            {line}
          </p>
        ))}
        {signed && (
          <p className="muted" style={{ fontSize: 12 }}>
            Invoice {signed.invoice_no} · IRN <span title={signed.irn}>{signed.irn.slice(0, 12)}…</span>
            {einvoice?.page ? ` · QR on page ${einvoice.page}` : ""}
          </p>
        )}
      </div>
    </div>
  );
}
