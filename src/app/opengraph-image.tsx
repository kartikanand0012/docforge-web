import { ImageResponse } from "next/og";

/** The card LinkedIn and others show for a shared link. */
export const alt = "DocForge: documents read, checked and signed, with every value traced to its page";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  const ink = "#1d1f20";
  const accent = "#416180";
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "#f4f4f5",
          backgroundImage: "linear-gradient(#e2e3e5 1px, transparent 1px), linear-gradient(90deg, #e2e3e5 1px, transparent 1px)",
          backgroundSize: "36px 36px",
          color: ink,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ width: 56, height: 56, border: `2px solid ${accent}`, color: accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, fontWeight: 700 }}>D</div>
          <div style={{ fontSize: 40, fontWeight: 700 }}>DocForge</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div style={{ fontSize: 64, fontWeight: 700, lineHeight: 1.08, letterSpacing: -1.5, maxWidth: 980 }}>Documents read, checked and signed.</div>
          <div style={{ fontSize: 30, color: "#4a4d50", maxWidth: 980 }}>Every value traced to the place on the page it was read from.</div>
        </div>
        <div style={{ display: "flex", gap: 14, fontSize: 24, color: accent }}>
          {["Invoice ↔ PO matching", "PIN-signed approvals", "Quoted answers", "Audit trail"].map((item) => (
            <div key={item} style={{ display: "flex", padding: "8px 16px", border: `1px solid ${accent}`, background: "#ffffff" }}>
              {item}
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
