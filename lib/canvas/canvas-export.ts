import { toPng } from "html-to-image";
import { getNodesBounds, getViewportForBounds, type Node } from "@xyflow/react";

/**
 * Client-side canvas → static-image export (PNG, with PDF layered on top).
 * Renders the `.react-flow__viewport` DOM node framed tightly around every
 * verse node regardless of the current pan/zoom — not a viewport-cropped
 * screenshot. Because this rasterizes the live DOM, the existing visual
 * distinction between canonical verse text (VerseNode) and AI-articulated
 * connection labels (HikmahEdge, color-coded by EdgeKind) carries through
 * automatically.
 */

const EXPORT_PADDING = 0.1;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2;
const IMAGE_WIDTH = 1600;
const IMAGE_HEIGHT = 1200;

export class CanvasExportError extends Error {}

function backgroundColor(): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue("--color-bg").trim();
  return value || "#0b0e14";
}

/** Renders the full graph (all nodes, not just the visible viewport) to a PNG data URL. */
export async function exportCanvasToPng(nodes: Node[]): Promise<string> {
  if (nodes.length === 0) throw new CanvasExportError("Canvas is empty");

  const viewportEl = document.querySelector<HTMLElement>(".react-flow__viewport");
  if (!viewportEl) throw new CanvasExportError("Canvas not found");

  const bounds = getNodesBounds(nodes);
  const viewport = getViewportForBounds(
    bounds,
    IMAGE_WIDTH,
    IMAGE_HEIGHT,
    MIN_ZOOM,
    MAX_ZOOM,
    EXPORT_PADDING
  );

  return toPng(viewportEl, {
    backgroundColor: backgroundColor(),
    width: IMAGE_WIDTH,
    height: IMAGE_HEIGHT,
    style: {
      width: `${IMAGE_WIDTH}px`,
      height: `${IMAGE_HEIGHT}px`,
      transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
    },
  });
}

/** Same render as {@link exportCanvasToPng}, embedded as a single-page PDF. */
export async function exportCanvasToPdf(nodes: Node[]): Promise<Blob> {
  const dataUrl = await exportCanvasToPng(nodes);
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({
    orientation: IMAGE_WIDTH >= IMAGE_HEIGHT ? "landscape" : "portrait",
    unit: "px",
    format: [IMAGE_WIDTH, IMAGE_HEIGHT],
  });
  pdf.addImage(dataUrl, "PNG", 0, 0, IMAGE_WIDTH, IMAGE_HEIGHT);
  return pdf.output("blob");
}

export function downloadDataUrl(dataUrl: string, filename: string): void {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  downloadDataUrl(url, filename);
  // Defer revoke: some browsers start the download asynchronously after
  // click(), and revoking the URL immediately can abort it before that read
  // completes.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
