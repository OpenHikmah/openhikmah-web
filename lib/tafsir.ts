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

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name: string) => ENTITIES[name.toLowerCase()] ?? m);
}

/**
 * Reduce a fragment of HTML to plain text. Decode entities first (so an
 * entity-encoded bracket can't survive as markup), strip tags repeatedly until
 * the string stops changing (a single pass can leave a reconstructed tag, e.g.
 * `<scr<script>ipt>`), then remove any stray/unterminated angle brackets. The
 * result is guaranteed to contain no `<`/`>`, so it's safe even before React
 * escapes it on render.
 */
function stripTags(s: string): string {
  let out = decodeEntities(s);
  let prev: string;
  do {
    prev = out;
    out = out.replace(/<[^>]*>/g, "");
  } while (out !== prev);
  return out.replace(/[<>]/g, "").replace(/\s+/g, " ").trim();
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
