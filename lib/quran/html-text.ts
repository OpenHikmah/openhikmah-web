/**
 * Plain-text helpers for HTML fragments from quran.com (tafsir bodies,
 * search-result translations). Output is rendered as escaped React text.
 */

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

// String.fromCodePoint throws above U+10FFFF; an out-of-range reference stays as
// literal text rather than failing the whole fragment.
const fromCodePointOrKeep = (ref: string, codePoint: number): string =>
  codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : ref;

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (m, n: string) => fromCodePointOrKeep(m, parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (m, n: string) => fromCodePointOrKeep(m, parseInt(n, 16)))
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
export function stripTags(s: string): string {
  let out = decodeEntities(s);
  let prev: string;
  do {
    prev = out;
    out = out.replace(/<[^>]*>/g, "");
  } while (out !== prev);
  return out.replace(/[<>]/g, "").replace(/\s+/g, " ").trim();
}
