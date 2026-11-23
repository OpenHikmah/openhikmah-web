// Sacred-data rule (AGENTS.md §Theological standards #4): fixtures use real or
// plausible Arabic, never Latin placeholders. Real Uthmani text for the refs the
// suites lean on; any other ref gets the basmala (plausible, and no test asserts
// on the Arabic of a seeded verse). Tamper-detection markers stay as-is.
const VERSES: Record<string, string> = {
  "1:1": "بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ",
  "2:255": "ٱللَّهُ لَآ إِلَٰهَ إِلَّا هُوَ ٱلْحَىُّ ٱلْقَيُّومُ",
  "112:1": "قُلْ هُوَ ٱللَّهُ أَحَدٌ",
};

export function arabicFor(ref: string): string {
  return VERSES[ref] ?? VERSES["1:1"];
}
