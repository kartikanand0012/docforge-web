import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Bot, Check, FileCheck2, Fingerprint, GitCompareArrows, MessageSquareQuote, ScanSearch, ShieldCheck, Webhook } from "lucide-react";
import { Marks } from "@/components/ui";

const DESCRIPTION =
  "Upload an invoice, purchase order or certificate. DocForge reads every value, shows where it was printed, checks it, matches the invoice to its order, and records a signed approval.";

export const metadata: Metadata = {
  title: { absolute: "DocForge · Documents read, checked and signed" },
  description: DESCRIPTION,
  openGraph: { title: "DocForge · Documents read, checked and signed", description: DESCRIPTION, type: "website" },
  twitter: { card: "summary_large_image", title: "DocForge · Documents read, checked and signed", description: DESCRIPTION },
};

// Figures from the eval suites as last run on labelled documents (the Evals page shows them
// live, with every suite). Each says what it was measured on.
const FIGURES = [
  { figure: "2,472 / 2,472", label: "labelled fields read correctly on born-digital invoices" },
  { figure: "98.1%", label: "of fields correct on poor-quality scans, read by OCR" },
  { figure: "9 / 9", label: "planted defects caught: wrong totals, GSTINs, batches, quantities" },
  { figure: "Every value", label: "traced to the box on the page it was read from" },
];

const STEPS = [
  { title: "Read", text: "The document is parsed page by page, scans by OCR, and each field is extracted with the block it came from." },
  { title: "Check", text: "Totals, tax, GSTIN checksums and required fields are verified; anything uncertain is flagged for a person." },
  { title: "Match", text: "An invoice is paired with its purchase order: quantities, rates, free goods, HSN codes and totals compared." },
  { title: "Sign", text: "A reviewer corrects what is wrong and signs with a PIN; the record gets a SHA-256 fingerprint and an approval draft." },
];

const FEATURES = [
  { icon: ScanSearch, title: "Values you can verify", text: "Click any value and see the exact place on the page it was read from. Nothing is shown without its source." },
  { icon: FileCheck2, title: "A review queue that explains itself", text: "Each document says why it needs a person: a failed check, a mismatch with its order, a value the model was unsure of." },
  { icon: GitCompareArrows, title: "Invoice to purchase-order matching", text: "Three-way checks before approval, with every discrepancy shown side by side." },
  { icon: Fingerprint, title: "Signed approvals and an audit trail", text: "PIN-signed decisions bound to the record's hash, and a hash-chained audit log anyone can verify." },
  { icon: MessageSquareQuote, title: "Ask questions, get quoted answers", text: "Chat answers only from your documents. Every claim carries a quote checked against the page; otherwise it says it does not know." },
  { icon: Webhook, title: "Fits the systems you have", text: "Signed webhooks tell your ERP when a document is ready or approved. CSV and JSON exports for everything." },
  { icon: Bot, title: "Ready for AI agents", text: "A read-only MCP server lets Claude and other agents search and read documents, with keys and rate limits." },
  { icon: ShieldCheck, title: "Private by design", text: "Every workspace is separated by row-level security in the database itself, not only in application code." },
];

const STACK = ["Next.js 16", "React 19", "FastAPI", "PostgreSQL row-level security", "pgvector hybrid search", "Docling", "Google Gemini", "Model Context Protocol", "Railway"];

/** A still of the review screen: values, where each came from, and what was checked. The
 * figures are from a synthetic sample invoice. */
function HeroPreview() {
  const rows = [
    { label: "Invoice number", value: "SRP/26-27/40002", ok: true, note: "Found where it says on page 1" },
    { label: "Seller GSTIN", value: "27AAKCS4821M1ZW", ok: true, note: "Checksum valid" },
    { label: "Line 1 · Quantity", value: "20", ok: true, note: "Matches the purchase order" },
    { label: "Batch UNL2812", value: "Assay 107.2%", ok: false, note: "Outside the certificate's limits" },
    { label: "Grand total", value: "₹15,263.00", ok: true, note: "Lines plus GST add up" },
  ];
  return (
    <div className="landing-preview marked" aria-hidden="true">
      <Marks />
      <div className="landing-preview-head">
        <span className="tag tag-accent">Invoice</span>
        <span className="mono">invoice.pdf</span>
        <span className="badge badge-warn">Needs a person</span>
      </div>
      <ul>
        {rows.map((row) => (
          <li key={row.label}>
            <span className="muted landing-preview-label">{row.label}</span>
            <span className="landing-preview-value num">{row.value}</span>
            <span className={`reason reason-${row.ok ? "ok" : "fail"}`}>
              {row.ok ? <Check strokeWidth={1.5} /> : <AlertTriangle strokeWidth={1.5} />}
              <span>{row.note}</span>
            </span>
          </li>
        ))}
      </ul>
      <div className="landing-preview-foot mono">sha256 7d3d23c… 3858ccb · signed with a PIN</div>
    </div>
  );
}

export default function Welcome() {
  return (
    <div className="landing">
      <header className="landing-nav">
        <span className="brand">
          <span className="brand-mark marked" aria-hidden="true">
            <Marks />D
          </span>
          <span className="brand-name">DocForge</span>
        </span>
        <nav aria-label="Account" className="landing-nav-links">
          <Link href="/login" className="btn btn-ghost">
            Sign in
          </Link>
          <Link href="/signup" className="btn btn-primary">
            Create a free account
          </Link>
        </nav>
      </header>

      <main>
        <section className="landing-hero blueprint-grid">
          <div className="landing-hero-text">
          <p className="landing-kicker">Document intelligence for accounts payable and quality teams</p>
          <h1>Documents read, checked and signed, with every value traced to its page.</h1>
          <p className="landing-lead">{DESCRIPTION}</p>
          <div className="landing-cta">
            <Link href="/signup" className="btn btn-primary marked landing-cta-main">
              <Marks />
              Create a free account <ArrowRight size={16} strokeWidth={1.5} aria-hidden="true" />
            </Link>
            <Link href="/login" className="btn btn-secondary">
              Sign in or try the demo
            </Link>
          </div>
          <p className="muted landing-note">Free workspace: up to 30 documents. Your documents are visible only to you.</p>
          </div>
          <HeroPreview />
        </section>

        <section className="landing-section" aria-labelledby="figures">
          <h2 id="figures" className="sr-only">
            Measured results
          </h2>
          <ul className="landing-figures">
            {FIGURES.map((item) => (
              <li key={item.label} className="marked">
                <Marks />
                <span className="landing-figure num">{item.figure}</span>
                <span className="muted">{item.label}</span>
              </li>
            ))}
          </ul>
          <p className="muted landing-small">
            Measured by eval suites on labelled synthetic Indian pharma invoices, orders and scans; long multi-page documents score lower, and the Evals page shows every suite.
          </p>
        </section>

        <section className="landing-section" aria-labelledby="how">
          <h2 id="how">How it works</h2>
          <ol className="landing-steps">
            {STEPS.map((step, index) => (
              <li key={step.title}>
                <span className="landing-step-no num">{index + 1}</span>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="landing-section" aria-labelledby="features">
          <h2 id="features">What is inside</h2>
          <ul className="landing-features">
            {FEATURES.map((feature) => (
              <li key={feature.title}>
                <feature.icon size={20} strokeWidth={1.5} aria-hidden="true" />
                <h3>{feature.title}</h3>
                <p>{feature.text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="landing-section" aria-labelledby="stack">
          <h2 id="stack">Built with</h2>
          <ul className="landing-stack">
            {STACK.map((item) => (
              <li key={item} className="tag tag-neutral">
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section className="landing-section landing-final marked">
          <Marks />
          <h2>Try it on your own documents</h2>
          <p>Create a workspace in under a minute, upload an invoice and its purchase order, and watch them read, checked and matched.</p>
          <div className="landing-cta">
            <Link href="/signup" className="btn btn-primary">
              Create a free account
            </Link>
            <Link href="/login" className="btn btn-secondary">
              Sign in
            </Link>
          </div>
        </section>
      </main>

      <footer className="landing-foot muted">
        <p>DocForge, built by Kartik Anand. Documents are read with Google Gemini; nothing is paid or posted to any system on your behalf.</p>
      </footer>
    </div>
  );
}
