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
export function stripTags(s: string): string {
  let out = decodeEntities(s);
  let prev: string;
  do {
    prev = out;
    out = out.replace(/<[^>]*>/g, "");
  } while (out !== prev);
  return out.replace(/[<>]/g, "").replace(/\s+/g, " ").trim();
}
