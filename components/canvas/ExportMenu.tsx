"use client";

import { useRef, useEffect, useState } from "react";
import { FocusScope } from "@radix-ui/react-focus-scope";
import { Image as ImageIcon, FileText } from "lucide-react";

interface ExportMenuProps {
  onSelect: (format: "png" | "pdf") => void;
  onClose: () => void;
}

const OPTIONS: Array<{
  format: "png" | "pdf";
  label: string;
  description: string;
  icon: typeof ImageIcon;
}> = [
  { format: "png", label: "PNG", description: "Image, current theme background", icon: ImageIcon },
  { format: "pdf", label: "PDF", description: "Single-page document", icon: FileText },
];

export function ExportMenu({ onSelect, onClose }: ExportMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [openUp, setOpenUp] = useState(false);

  useEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    if (rect.bottom > window.innerHeight - 16) {
      setOpenUp(true);
    }
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <FocusScope asChild trapped loop>
      <div
        ref={menuRef}
        className={`absolute left-1/2 z-50 w-48 -translate-x-1/2 ${openUp ? "bottom-full mb-1" : "top-full mt-1"}`}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="rounded-md border border-border overflow-hidden bg-surface-overlay shadow-sm">
          {OPTIONS.map((opt) => (
            <button
              key={opt.format}
              onClick={() => {
                onSelect(opt.format);
                onClose();
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors cursor-pointer hover:bg-white/5 focus-visible:outline-none focus-visible:bg-white/5"
            >
              <opt.icon className="h-4 w-4 shrink-0 text-text-muted" />
              <div className="min-w-0">
                <p className="text-xs font-medium text-text-primary">{opt.label}</p>
                <p className="text-xs text-text-muted">{opt.description}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </FocusScope>
  );
}
