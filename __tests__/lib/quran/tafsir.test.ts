import { describe, it, expect } from "vitest";
import { htmlToTafsirBlocks } from "@/lib/quran/tafsir";

describe("htmlToTafsirBlocks", () => {
  it("extracts plain paragraph, div, and heading blocks with tags stripped", () => {
    const blocks = htmlToTafsirBlocks("<h2>Title</h2><p>Body <b>text</b></p><div>Plain div</div>");
    expect(blocks).toEqual([
      { arabic: false, text: "Title" },
      { arabic: false, text: "Body text" },
      { arabic: false, text: "Plain div" },
    ]);
  });

  it('marks class="...arabic..." blocks as arabic: true and others as false', () => {
    const blocks = htmlToTafsirBlocks(
      '<div class="foo arabic bar">quoted</div><div class="arabicish">not a match</div>'
    );
    // Word-boundary regex: "arabic" must appear as a whole class token, so
    // "arabicish" must NOT be classified as arabic.
    expect(blocks).toEqual([
      { arabic: true, text: "quoted" },
      { arabic: false, text: "not a match" },
    ]);
  });

  it("decodes entity-encoded markup to literal text, never letting it survive as unescaped angle brackets", () => {
    const blocks = htmlToTafsirBlocks("<div>&lt;script&gt;alert(1)&lt;/script&gt;</div>");
    expect(blocks).toHaveLength(1);
    expect(blocks[0].text).toBe("alert(1)");
    expect(blocks[0].text).not.toMatch(/[<>]/);
  });

  it("neutralizes a reconstructed-tag bypass attempt (no < or > survives, for any adversarial input)", () => {
    // The classic hide-a-tag-inside-a-tag trick: a single-pass strip would
    // leave "<script>" behind once the outer layer is removed. The
    // strip-until-stable loop must catch it.
    const blocks = htmlToTafsirBlocks("<div><scr<script>ipt>alert(1)</scr</script>ipt></div>");
    expect(blocks).toHaveLength(1);
    expect(blocks[0].text).not.toMatch(/[<>]/);
    // The residual text is inert (no markup delimiters left), even though
    // the words "alert(1)" remain as plain text.
    expect(blocks[0].text).toBe("iptalert(1)ipt");
  });

  it("falls back to a single English block when no recognized block tags are present", () => {
    const blocks = htmlToTafsirBlocks("just plain text, no block tags <b>bold</b> inline");
    expect(blocks).toEqual([{ arabic: false, text: "just plain text, no block tags bold inline" }]);
  });

  it("skips empty and whitespace-only blocks instead of pushing empty-string entries", () => {
    const blocks = htmlToTafsirBlocks("<div></div><p>   </p><div>Real content</div>");
    expect(blocks).toEqual([{ arabic: false, text: "Real content" }]);
  });

  it("preserves document order across mixed English and Arabic blocks", () => {
    const blocks = htmlToTafsirBlocks(
      '<h2>Title</h2><p>Body <b>text</b></p><div class="arabic">قرآن</div>'
    );
    expect(blocks).toEqual([
      { arabic: false, text: "Title" },
      { arabic: false, text: "Body text" },
      { arabic: true, text: "قرآن" },
    ]);
  });
});
