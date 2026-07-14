import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Node } from "@xyflow/react";

const { mockToPng } = vi.hoisted(() => ({
  mockToPng: vi.fn(async () => "data:image/png;base64,fake"),
}));

vi.mock("html-to-image", () => ({ toPng: mockToPng }));

const { mockAddImage, mockOutput } = vi.hoisted(() => ({
  mockAddImage: vi.fn(),
  mockOutput: vi.fn(() => new Blob(["fake-pdf"], { type: "application/pdf" })),
}));

vi.mock("jspdf", () => ({
  jsPDF: vi.fn().mockImplementation(function MockJsPdf(this: unknown) {
    Object.assign(this as object, { addImage: mockAddImage, output: mockOutput });
  }),
}));

import {
  exportCanvasToPng,
  exportCanvasToPdf,
  CanvasExportError,
} from "@/lib/canvas/canvas-export";

function makeNode(id: string): Node {
  return { id, position: { x: 0, y: 0 }, data: {} };
}

describe("exportCanvasToPng", () => {
  beforeEach(() => {
    mockToPng.mockClear();
    document.body.innerHTML = "";
  });

  it("throws CanvasExportError when the canvas is empty", async () => {
    await expect(exportCanvasToPng([])).rejects.toThrow(CanvasExportError);
  });

  it("throws CanvasExportError when the viewport element isn't found", async () => {
    await expect(exportCanvasToPng([makeNode("1")])).rejects.toThrow(/Canvas not found/);
  });

  it("returns a data URL when the viewport element is present", async () => {
    const el = document.createElement("div");
    el.className = "react-flow__viewport";
    document.body.appendChild(el);

    const result = await exportCanvasToPng([makeNode("1")]);
    expect(result).toBe("data:image/png;base64,fake");
    expect(mockToPng).toHaveBeenCalledWith(el, expect.any(Object));
  });
});

describe("exportCanvasToPdf", () => {
  beforeEach(() => {
    mockToPng.mockClear();
    mockAddImage.mockClear();
    document.body.innerHTML = "";
    const el = document.createElement("div");
    el.className = "react-flow__viewport";
    document.body.appendChild(el);
  });

  it("embeds the rendered PNG into a PDF blob", async () => {
    const blob = await exportCanvasToPdf([makeNode("1")]);
    expect(mockAddImage).toHaveBeenCalled();
    expect(blob).toBeInstanceOf(Blob);
  });
});
