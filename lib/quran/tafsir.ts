import { stripTags } from "@/lib/quran/html-text";

/**
 * Turns quran.com tafsir HTML into ordered plain-text blocks so the UI can render
 * it as escaped React text (no dangerouslySetInnerHTML, no XSS surface) while
 * keeping the structure: English commentary paragraphs and the quoted Arabic
 * phrases (`<div class="arabic …">`) it explains.
 */
export interface TafsirBlock {
  /** True for a quoted Arabic phrase (render RTL/Amiri); false for English prose. */
  arabic: boolean;
  text: string;
}

export function htmlToTafsirBlocks(html: string): TafsirBlock[] {
  const blocks: TafsirBlock[] = [];
  const blockRe = /<(div|p|h[1-6])\b([^>]*)>([\s\S]*?)<\/\1>/gi;
  let match: RegExpExecArray | null;
  while ((match = blockRe.exec(html)) !== null) {
    const attrs = match[2] ?? "";
    const text = stripTags(match[3] ?? "");
    if (!text) continue;
    blocks.push({ arabic: /class=["'][^"']*\barabic\b/i.test(attrs), text });
  }
  // Fallback: no recognised block tags — return the whole thing as one English block.
  if (blocks.length === 0) {
    const text = stripTags(html);
    if (text) blocks.push({ arabic: false, text });
  }
  return blocks;
}
