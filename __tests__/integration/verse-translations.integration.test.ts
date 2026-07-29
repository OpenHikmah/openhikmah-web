import { describe, it, expect, beforeEach, vi } from "vitest";
import { sql, eq } from "drizzle-orm";

// Real Postgres (Testcontainers). No live fetch should ever be needed once the
// corpus + translation rows are seeded.
vi.stubGlobal(
  "fetch",
  vi.fn(async () => ({ ok: false }))
);

import { db } from "@/lib/infra/db";
import { verses, verseTranslations } from "@/lib/infra/db/schema";
import { getVerse, getVerses } from "@/lib/quran/quran-corpus";
import { resolveVerse } from "@/lib/quran/verse-resolver";

async function reset() {
  await db.execute(sql`TRUNCATE verses, verse_translations RESTART IDENTITY CASCADE`);
}

async function seedVerse(ref: string, translation = `en-${ref}`) {
  const [s, a] = ref.split(":");
  await db.insert(verses).values({
    ref,
    surah: Number(s),
    ayah: Number(a),
    arabicText: `arabic-${ref}`,
    translation,
  });
}

beforeEach(async () => {
  await reset();
  await seedVerse("1:1", "en.sahih text");
  await seedVerse("2:255", "en.sahih ayat al-kursi");
});

describe("verse_translations (integration, real Postgres)", () => {
  it("getVerse falls back to the base en.sahih column when no edition is requested", async () => {
    const v = await getVerse("1:1");
    expect(v?.translation).toBe("en.sahih text");
  });

  it("getVerse returns the edition-specific row when one exists", async () => {
    await db.insert(verseTranslations).values({
      ref: "1:1",
      edition: "tr.diyanet",
      language: "tr",
      text: "Türkçe metin",
    });
    const v = await getVerse("1:1", "tr.diyanet");
    expect(v?.translation).toBe("Türkçe metin");
  });

  it("getVerse COALESCEs back to en.sahih when the requested edition has no row for this verse", async () => {
    // No verse_translations row for 2:255/tr.diyanet at all.
    const v = await getVerse("2:255", "tr.diyanet");
    expect(v?.translation).toBe("en.sahih ayat al-kursi");
  });

  it("getVerses batch-resolves a mix of translated and untranslated refs for the same edition", async () => {
    await db.insert(verseTranslations).values({
      ref: "1:1",
      edition: "ru.kuliev",
      language: "ru",
      text: "Русский текст",
    });
    const map = await getVerses(["1:1", "2:255"], "ru.kuliev");
    expect(map.get("1:1")?.translation).toBe("Русский текст");
    expect(map.get("2:255")?.translation).toBe("en.sahih ayat al-kursi");
  });

  it("resolveVerse resolves the requested edition from the local corpus without a live fetch", async () => {
    await db.insert(verseTranslations).values({
      ref: "1:1",
      edition: "az.mammadaliyev",
      language: "az",
      text: "Azərbaycan mətni",
    });
    const v = await resolveVerse("1:1", "az.mammadaliyev");
    expect(v?.translation).toBe("Azərbaycan mətni");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("deleting a verse cascades to its translation rows", async () => {
    await db.insert(verseTranslations).values({
      ref: "1:1",
      edition: "tr.diyanet",
      language: "tr",
      text: "Türkçe metin",
    });
    await db.execute(sql`DELETE FROM verses WHERE ref = '1:1'`);
    const rows = await db.select().from(verseTranslations).where(eq(verseTranslations.ref, "1:1"));
    expect(rows.length).toBe(0);
  });
});
