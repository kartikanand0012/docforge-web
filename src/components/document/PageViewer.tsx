"use client";

import { Minus, Plus, X } from "lucide-react";
import { Marks } from "@/components/ui";
import { apiUrl } from "@/lib/api";
import { toOverlay, uniqueBoxes, type Box } from "@/lib/geometry";
import type { FieldView, PageInfo } from "@/lib/review";

export type Highlight = { boxes: Box[]; label: string; quote: string; source: string };

type Props = {
  documentId: string;
  pages: PageInfo[];
  page: number;
  onPage: (page: number) => void;
  fields: FieldView[];
  hoveredPath: string | null;
  activePath: string | null;
  onHover: (path: string | null) => void;
  onActivate: (path: string) => void;
  showAll: boolean;
  onShowAll: (show: boolean) => void;
  zoom: number;
  onZoom: (zoom: number) => void;
  highlight: Highlight | null;
  onClearHighlight: () => void;
};

export const ZOOMS = [50, 75, 100, 125, 150, 175, 200];

/** The page image with a box wherever a value was read (screen 3, left). Boxes are placed
 * in percentages of the page, so they follow the zoom. */
export function PageViewer(props: Props) {
  const { documentId, pages, page, fields, hoveredPath, activePath, showAll, zoom, highlight } = props;
  const info = pages.find((candidate) => candidate.number === page) ?? pages[0];
  const size = info ? { width: info.width, height: info.height } : { width: 595, height: 842 };
  const zoomAt = ZOOMS.indexOf(zoom);

  return (
    <section className="viewer" aria-label="Page">
      <div className="viewer-toolbar">
        <span className="num">
          Page{" "}
          {pages.length > 1 ? (
            <select className="input viewer-page" value={page} onChange={(e) => props.onPage(Number(e.target.value))} aria-label="Page">
              {pages.map((candidate) => (
                <option key={candidate.number} value={candidate.number}>
                  {candidate.number}
                </option>
              ))}
            </select>
          ) : (
            page
          )}{" "}
          of {Math.max(pages.length, 1)}
        </span>
        <span className="viewer-zoom">
          <button className="btn btn-secondary btn-icon" aria-label="Zoom out" disabled={zoomAt <= 0} onClick={() => props.onZoom(ZOOMS[zoomAt - 1])}>
            <Minus size={14} strokeWidth={1.5} aria-hidden="true" />
          </button>
          <span className="num" aria-live="polite" style={{ minWidth: 44, textAlign: "center" }}>
            {zoom}%
          </span>
          <button
            className="btn btn-secondary btn-icon"
            aria-label="Zoom in"
            disabled={zoomAt >= ZOOMS.length - 1}
            onClick={() => props.onZoom(ZOOMS[zoomAt + 1])}
          >
            <Plus size={14} strokeWidth={1.5} aria-hidden="true" />
          </button>
        </span>
        <label className="check">
          <input type="checkbox" checked={showAll} onChange={(e) => props.onShowAll(e.target.checked)} /> Show every box
        </label>
        <span className="viewer-legend" aria-hidden="true">
          <span className="legend-read" /> Read <span className="legend-flag" /> Needs a person
        </span>
      </div>

      {highlight && (
        <div className="viewer-quote" role="status">
          <p>
            Showing {highlight.source}: “{highlight.quote}”
          </p>
          <button className="btn btn-ghost" onClick={props.onClearHighlight}>
            <X size={14} strokeWidth={1.5} aria-hidden="true" /> Clear
          </button>
        </div>
      )}

      <div className="viewer-canvas blueprint-grid">
        <div className="page-frame marked" style={{ width: `${zoom}%`, aspectRatio: `${size.width} / ${size.height}` }}>
          <Marks />
          {/* eslint-disable-next-line @next/next/no-img-element -- the API's own PNG, through the proxy */}
          <img src={apiUrl(`/documents/${documentId}/pages/${page}`)} alt={`Page ${page} of the document`} className="page-image" />
          {fields.map((field) => {
            const active = field.path === activePath;
            const hovered = field.path === hoveredPath;
            if (!showAll && !field.flagged && !active && !hovered) return null;
            return uniqueBoxes(field.boxes)
              .filter((box) => box.page === page)
              .map((box, index) => {
                const place = toOverlay(box, size);
                return (
                  <button
                    key={`${field.path}-${index}`}
                    type="button"
                    tabIndex={-1}
                    aria-label={`Value read here: ${field.label}`}
                    className={`value-box${field.flagged ? " flagged" : ""}${active ? " active" : ""}${hovered ? " hovered" : ""}`}
                    style={place}
                    onMouseEnter={() => props.onHover(field.path)}
                    onMouseLeave={() => props.onHover(null)}
                    onClick={() => props.onActivate(field.path)}
                  >
                    {(active || hovered) && index === 0 && <span className="box-label">{field.label}</span>}
                  </button>
                );
              });
          })}
          {highlight && uniqueBoxes(highlight.boxes)
            .filter((box) => box.page === page)
            .map((box, index) => (
              <span key={`quote-${index}`} className="value-box quote" style={toOverlay(box, size)} aria-hidden="true">
                {index === 0 && <span className="box-label">{highlight.label}</span>}
              </span>
            ))}
        </div>
      </div>
    </section>
  );
}
