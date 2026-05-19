"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { useCanvasStore } from "@/store/canvas";
import type { EdgeKind } from "@/types/quran";

const KIND_LABEL: Record<EdgeKind, string> = {
  thematic: "Thematic",
  root: "Root word",
  contrast: "Contrast",
};

const KIND_COLOR: Record<EdgeKind, string> = {
  thematic: "var(--color-teal)",
  root: "var(--color-gold)",
  contrast: "var(--color-contrast-edge)",
};

export function ContextSidebar() {
  const sidebarContent = useCanvasStore((s) => s.sidebarContent);
  const setSidebarContent = useCanvasStore((s) => s.setSidebarContent);

  return (
    <AnimatePresence>
      {sidebarContent && (
        <motion.aside
          key="sidebar"
          initial={{ x: 320, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 320, opacity: 0 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
          className="absolute top-0 right-0 h-full w-72 z-40 flex flex-col pointer-events-auto"
          style={{
            background: "var(--color-surface)",
            borderLeft: "1px solid var(--color-border)",
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 h-10 border-b shrink-0"
            style={{ borderColor: "var(--color-border)" }}
          >
            <span
              className="text-xs"
              style={{ color: "var(--color-text-muted)" }}
            >
              {sidebarContent.type === "node" ? "Verse" : "Connection"}
            </span>
            <button
              onClick={() => setSidebarContent(null)}
              className="w-6 h-6 rounded flex items-center justify-center transition-colors cursor-pointer hover:bg-white/5"
              style={{ color: "var(--color-text-muted)" }}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            {sidebarContent.type === "node" && (
              <>
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="text-xs font-mono"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    {sidebarContent.verse.surahName}
                  </span>
                  <span
                    className="text-xs font-mono px-1.5 py-0.5 rounded border shrink-0"
                    style={{
                      color: "var(--color-gold)",
                      borderColor: "var(--color-gold)",
                      background: "rgba(201,168,76,0.08)",
                    }}
                  >
                    {sidebarContent.verse.ref}
                  </span>
                </div>

                <p
                  className="font-arabic text-right text-lg leading-loose"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  {sidebarContent.verse.arabicText}
                </p>

                <p
                  className="text-sm leading-relaxed"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  {sidebarContent.verse.translation}
                </p>
              </>
            )}

            {sidebarContent.type === "edge" && (
              <>
                {/* Kind badge */}
                <span
                  className="inline-flex items-center text-xs px-2 py-0.5 rounded border"
                  style={{
                    color: KIND_COLOR[sidebarContent.kind],
                    borderColor: `${KIND_COLOR[sidebarContent.kind]}44`,
                    background: `${KIND_COLOR[sidebarContent.kind]}0f`,
                  }}
                >
                  {KIND_LABEL[sidebarContent.kind]}
                </span>

                {/* From verse */}
                <div
                  className="rounded-md border p-3 space-y-1"
                  style={{
                    background: "var(--color-surface-raised)",
                    borderColor: "var(--color-border)",
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                      {sidebarContent.fromVerse.surahName}
                    </span>
                    <span className="text-xs font-mono" style={{ color: "var(--color-text-muted)" }}>
                      {sidebarContent.fromVerse.ref}
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>
                    {sidebarContent.fromVerse.translation.slice(0, 100)}…
                  </p>
                </div>

                {/* Reason */}
                <div
                  className="rounded-md border p-3"
                  style={{
                    background: "var(--color-surface-raised)",
                    borderColor: "var(--color-border)",
                  }}
                >
                  <p className="text-xs mb-1.5" style={{ color: "var(--color-text-muted)" }}>
                    Why connected
                  </p>
                  <p className="text-xs leading-relaxed" style={{ color: "var(--color-text-primary)" }}>
                    {sidebarContent.reason}
                  </p>
                </div>

                {/* To verse */}
                <div
                  className="rounded-md border p-3 space-y-2"
                  style={{
                    background: "var(--color-surface-raised)",
                    borderColor: "var(--color-border)",
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                      {sidebarContent.toVerse.surahName}
                    </span>
                    <span className="text-xs font-mono" style={{ color: "var(--color-text-muted)" }}>
                      {sidebarContent.toVerse.ref}
                    </span>
                  </div>
                  <p className="font-arabic text-right text-sm leading-loose" style={{ color: "var(--color-text-primary)" }}>
                    {sidebarContent.toVerse.arabicText}
                  </p>
                  <p className="text-xs leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>
                    {sidebarContent.toVerse.translation.slice(0, 100)}…
                  </p>
                </div>
              </>
            )}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
