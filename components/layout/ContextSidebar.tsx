"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { useCanvasStore } from "@/store/canvas";
import type { EdgeKind } from "@/types/quran";

const KIND_LABEL: Record<EdgeKind, string> = {
  thematic: "Thematic Connection",
  root: "Root Word Connection",
  contrast: "Contrast Connection",
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
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="absolute top-0 right-0 h-full w-80 z-40 flex flex-col pointer-events-auto"
          style={{
            background: "var(--color-surface)",
            borderLeft: "1px solid var(--color-border)",
          }}
        >
          <div
            className="flex items-center justify-between px-4 py-3 border-b shrink-0"
            style={{ borderColor: "var(--color-border)" }}
          >
            <span
              className="text-xs font-mono uppercase tracking-wider"
              style={{ color: "var(--color-text-muted)" }}
            >
              {sidebarContent.type === "node" ? "Verse Detail" : "Connection"}
            </span>
            <button
              onClick={() => setSidebarContent(null)}
              className="rounded-md p-1 transition-colors hover:bg-white/5"
              style={{ color: "var(--color-text-muted)" }}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
            {sidebarContent.type === "node" && (
              <>
                <div className="flex items-center justify-between">
                  <span
                    className="text-xs font-mono uppercase tracking-wider"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    {sidebarContent.verse.surahName}
                  </span>
                  <span
                    className="text-xs font-mono px-2 py-0.5 rounded-full border"
                    style={{
                      color: "var(--color-gold)",
                      borderColor: "var(--color-gold)",
                      background: "rgba(201,168,76,0.1)",
                    }}
                  >
                    {sidebarContent.verse.ref}
                  </span>
                </div>

                <p
                  className="font-arabic text-right text-xl leading-loose"
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
                <div
                  className="rounded-lg px-3 py-2 text-xs font-mono"
                  style={{
                    background: `${KIND_COLOR[sidebarContent.kind]}18`,
                    color: KIND_COLOR[sidebarContent.kind],
                    border: `1px solid ${KIND_COLOR[sidebarContent.kind]}44`,
                  }}
                >
                  {KIND_LABEL[sidebarContent.kind]}
                </div>

                <div className="space-y-1">
                  <p
                    className="text-xs font-mono uppercase tracking-wider"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    From
                  </p>
                  <div
                    className="rounded-lg p-3 border"
                    style={{
                      background: "var(--color-surface-raised)",
                      borderColor: "var(--color-border)",
                    }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span
                        className="text-xs"
                        style={{ color: "var(--color-text-muted)" }}
                      >
                        {sidebarContent.fromVerse.surahName}
                      </span>
                      <span
                        className="text-xs font-mono"
                        style={{ color: "var(--color-text-muted)" }}
                      >
                        {sidebarContent.fromVerse.ref}
                      </span>
                    </div>
                    <p
                      className="text-xs leading-relaxed"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      {sidebarContent.fromVerse.translation.slice(0, 120)}…
                    </p>
                  </div>
                </div>

                <div
                  className="rounded-lg px-4 py-3 border"
                  style={{
                    background: "var(--color-surface-raised)",
                    borderColor: "var(--color-border)",
                  }}
                >
                  <p
                    className="text-xs font-mono uppercase tracking-wider mb-2"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    Theological link
                  </p>
                  <p
                    className="text-sm leading-relaxed italic"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    &ldquo;{sidebarContent.reason}&rdquo;
                  </p>
                </div>

                <div className="space-y-1">
                  <p
                    className="text-xs font-mono uppercase tracking-wider"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    To
                  </p>
                  <div
                    className="rounded-lg p-3 border"
                    style={{
                      background: "var(--color-surface-raised)",
                      borderColor: "var(--color-border)",
                    }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span
                        className="text-xs"
                        style={{ color: "var(--color-text-muted)" }}
                      >
                        {sidebarContent.toVerse.surahName}
                      </span>
                      <span
                        className="text-xs font-mono"
                        style={{ color: "var(--color-text-muted)" }}
                      >
                        {sidebarContent.toVerse.ref}
                      </span>
                    </div>
                    <p
                      className="font-arabic text-right text-base leading-loose"
                      style={{ color: "var(--color-text-primary)" }}
                    >
                      {sidebarContent.toVerse.arabicText}
                    </p>
                    <p
                      className="text-xs leading-relaxed mt-2"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      {sidebarContent.toVerse.translation.slice(0, 120)}…
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
