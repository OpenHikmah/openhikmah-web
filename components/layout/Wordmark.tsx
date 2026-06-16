import Link from "next/link";
import Image from "next/image";

/**
 * The Open Hikmah logo + wordmark, linking home. Single source of truth shared
 * by every header (landing + canvas) so the brand mark never drifts between
 * surfaces — same icon, size, weight, and spacing everywhere.
 */
export function Wordmark() {
  return (
    <Link href="/" className="flex items-center gap-2 transition-opacity hover:opacity-80">
      <Image src="/logo-mark.png" alt="" width={20} height={20} className="size-5" priority />
      <span className="text-[15px] font-semibold text-text-primary">Open Hikmah</span>
    </Link>
  );
}
