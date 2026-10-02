import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockSelect, mockIncr } = vi.hoisted(() => ({ mockSelect: vi.fn(), mockIncr: vi.fn() }));
vi.mock("@/lib/infra/db", () => ({ db: { select: mockSelect } }));
vi.mock("@/lib/infra/metrics", () => ({ incr: mockIncr }));

import { verseContainsName, verseMentionsName, rootLetters } from "@/lib/names/name-verse-match";
import { getNameBySlug } from "@/lib/names/divine-names";

const name = (slug: string) => {
  const n = getNameBySlug(slug);
  if (!n) throw new Error(`fixture: unknown name ${slug}`);
  return n;
};

// Corpus (Uthmani) text of the verses used below.
const V_1_1 = "بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ";
const V_2_255 = "ٱللَّهُ لَآ إِلَٰهَ إِلَّا هُوَ ٱلْحَىُّ ٱلْقَيُّومُ";
const V_112_1 = "قُلْ هُوَ ٱللَّهُ أَحَدٌ";
const V_59_23 =
  "هُوَ ٱللَّهُ ٱلَّذِى لَآ إِلَٰهَ إِلَّا هُوَ ٱلْمَلِكُ ٱلْقُدُّوسُ ٱلسَّلَٰمُ ٱلْمُؤْمِنُ ٱلْمُهَيْمِنُ";

describe("verseContainsName", () => {
  it("finds a name in a verse regardless of tashkeel and the wasla/dagger-alef spelling", () => {
    expect(verseContainsName(V_1_1, name("ar-rahman"))).toBe(true);
    expect(verseContainsName(V_1_1, name("ar-rahim"))).toBe(true);
    expect(verseContainsName(V_2_255, name("al-hayy"))).toBe(true); // ٱلْحَىُّ: ى folds to ي
    expect(verseContainsName(V_2_255, name("al-qayyum"))).toBe(true);
    expect(verseContainsName(V_59_23, name("al-malik"))).toBe(true);
    expect(verseContainsName(V_59_23, name("al-mumin"))).toBe(true); // hamza on waw
  });

  it("matches a long ā written as a dagger alef in the corpus against a full alef in the name", () => {
    // 59:23 spells ٱلسَّلَٰمُ; the names data spells السَّلَام.
    expect(verseContainsName(V_59_23, name("as-salam"))).toBe(true);
  });

  it("rejects a verse that does not contain the name", () => {
    expect(verseContainsName(V_112_1, name("ar-rahman"))).toBe(false);
    expect(verseContainsName(V_1_1, name("al-malik"))).toBe(false);
    expect(verseContainsName(V_2_255, name("ar-rahim"))).toBe(false);
  });

  it("does not let a name that merely shares a root match its sibling", () => {
    // ar-rahman and ar-rahim share ر-ح-م; the verse text only has ar-rahman.
    expect(verseContainsName("ٱلرَّحْمَٰنُ عَلَّمَ ٱلْقُرْءَانَ", name("ar-rahim"))).toBe(false);
    expect(verseContainsName("ٱلرَّحْمَٰنُ عَلَّمَ ٱلْقُرْءَانَ", name("ar-rahman"))).toBe(true);
  });

  it("accepts a name with a fused proclitic (و, ب, ل + article)", () => {
    expect(verseContainsName("وَبِٱلْحَىِّ", name("al-hayy"))).toBe(true);
    expect(verseContainsName("وَٱلرَّحْمَٰنِ", name("ar-rahman"))).toBe(true);
  });

  it("does not treat the plural of a name as the Name", () => {
    // ٱلْمُؤْمِنِينَ "the believers" is not the divine name ٱلْمُؤْمِنُ.
    expect(verseContainsName("وَبَشِّرِ ٱلْمُؤْمِنِينَ", name("al-mumin"))).toBe(false);
  });

  it("does not match a very short stem inside an unrelated word (الله vs له)", () => {
    const allah = { arabic: "اللَّه", root: "ا-ل-ه" };
    expect(verseContainsName("لَهُۥ مَا فِى ٱلسَّمَٰوَٰتِ", allah)).toBe(false);
    expect(verseContainsName(V_112_1, allah)).toBe(true);
  });

  it("accepts a word carrying the name's root when morphology provides it", () => {
    expect(verseContainsName("يَغْفِرُ لَكُمْ", name("al-ghaffar"), ["غفر"])).toBe(true);
    expect(verseContainsName("يَغْفِرُ لَكُمْ", name("al-ghaffar"))).toBe(false);
    expect(verseContainsName("يَغْفِرُ لَكُمْ", name("al-ghaffar"), ["علم"])).toBe(false);
  });

  it("folds hamza forms when comparing roots", () => {
    expect(rootLetters("أ-م-ن")).toBe(rootLetters("ا-م-ن"));
  });
});

describe("verseMentionsName", () => {
  beforeEach(() => {
    mockSelect.mockReset();
    mockIncr.mockReset();
  });

  const rowsChain = (rows: unknown[]) => ({
    from: () => ({ where: () => Promise.resolve(rows) }),
  });

  it("passes on the text check without touching the database", async () => {
    expect(await verseMentionsName("1:1", V_1_1, name("ar-rahman"))).toBe(true);
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("falls back to the corpus root when the text does not spell the name", async () => {
    mockSelect.mockReturnValue(rowsChain([{ root: "غفر" }, { root: null }]));
    expect(await verseMentionsName("3:31", "يَغْفِرْ لَكُمْ", name("al-ghaffar"))).toBe(true);
  });

  it("treats a ref with no morphology rows as unknown, not as a match", async () => {
    mockSelect.mockReturnValue(rowsChain([]));
    expect(await verseMentionsName("2:1", V_112_1, name("ar-rahman"))).toBe(false);
  });

  it("logs and meters a failed morphology lookup, and rejects rather than guessing", async () => {
    mockSelect.mockImplementation(() => {
      throw new Error("db down");
    });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await verseMentionsName("2:1", V_112_1, name("ar-rahman"))).toBe(false);
    expect(mockIncr).toHaveBeenCalledWith("names_morphology_lookup_error");
    errSpy.mockRestore();
  });
});
