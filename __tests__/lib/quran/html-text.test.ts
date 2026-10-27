import { describe, it, expect } from "vitest";
import { stripTags } from "@/lib/quran/html-text";

describe("stripTags", () => {
  it("removes tags and collapses whitespace", () => {
    expect(stripTags("<p>In the  name\n of <b>Allah</b></p>")).toBe("In the name of Allah");
  });

  it("decodes named, decimal and hex entities", () => {
    expect(stripTags("Tom &amp; Jerry &quot;x&quot; &#65;&#x42;")).toBe('Tom & Jerry "x" AB');
  });

  it("leaves unknown entities as literal text", () => {
    expect(stripTags("a &unknownentity; b")).toBe("a &unknownentity; b");
  });

  it("keeps an out-of-range code point reference instead of throwing", () => {
    expect(stripTags("x &#99999999; y")).toBe("x &#99999999; y");
  });

  it("cannot be tricked into leaving markup by an entity-encoded tag", () => {
    const out = stripTags("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(out).not.toMatch(/[<>]/);
    expect(out).toBe("alert(1)");
  });

  it("strips reconstructed nested tags in repeated passes", () => {
    const out = stripTags("<scr<script>ipt>alert(1)</scr</script>ipt>");
    expect(out).not.toMatch(/[<>]/);
    expect(out).toContain("alert(1)");
    // A single pass would leave "<script>"; the loop must not reassemble it.
    expect(out).not.toContain("<script");
  });

  it("drops stray and unterminated angle brackets", () => {
    expect(stripTags("a < b")).toBe("a b");
    expect(stripTags("a > b")).toBe("a b");
    // Only the bracket goes; the text after an unterminated "<" is kept.
    expect(stripTags("broken <div class=")).toBe("broken div class=");
  });

  it("treats a < ... > pair as a tag, so conservative stripping never leaves markup behind", () => {
    expect(stripTags("1 < 2 and 3 > 2")).toBe("1 2");
  });

  it("preserves Arabic text", () => {
    expect(stripTags("<span>بِسْمِ ٱللَّهِ</span>")).toBe("بِسْمِ ٱللَّهِ");
  });
});
