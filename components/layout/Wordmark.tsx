import Link from "next/link";
import { BookOpen } from "lucide-react";

/**
 * The Open Hikmah logo + wordmark, linking home. Single source of truth shared
 * by every header (landing + canvas) so the brand mark never drifts between
 * surfaces — same icon, size, weight, and spacing everywhere.
 */
export function Wordmark() {
  return (
    <Link href="/" className="flex items-center gap-2 transition-opacity hover:opacity-80">
      <BookOpen className="size-4 text-gold" />
      <span className="text-[15px] font-semibold text-text-primary">Open Hikmah</span>
    </Link>
  );
}
