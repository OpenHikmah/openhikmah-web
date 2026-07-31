import { describe, it, expect, beforeEach } from "vitest";
import { sql, and, eq } from "drizzle-orm";
import { db } from "@/lib/infra/db";
import { nameContent, nameVerseReasons } from "@/lib/infra/db/schema";
import { getOrGenerateNameContent, getOrGenerateVerseReason } from "@/lib/names/name-content";

async function reset() {
  await db.execute(sql`TRUNCATE name_content, name_verse_reasons RESTART IDENTITY CASCADE`);
}

beforeEach(reset);

describe("name_content locale PK + name_verse_reasons (integration, real Postgres)", () => {
  it("migration 0019 preserves a pre-existing (slug, kind) row as locale='en' under the new PK", async () => {
    // Simulate a row written before migration 0019 by omitting `locale` and
    // relying on its DB default, exactly as existing rows were left after the
    // migration ran (see lib/infra/db/migrations/0019_name_content_locale.sql).
    await db.execute(
      sql`INSERT INTO name_content (slug, kind, data, version) VALUES ('ar-rahman', 'reflection', ${JSON.stringify("pre-migration reflection")}, 1)`
    );

    const [row] = await db
      .select()
      .from(nameContent)
      .where(and(eq(nameContent.slug, "ar-rahman"), eq(nameContent.kind, "reflection")));

    expect(row.locale).toBe("en");
    expect(JSON.parse(row.data)).toBe("pre-migration reflection");
  });

  it("getOrGenerateNameContent stores independent rows per locale under the same (slug, kind)", async () => {
    await getOrGenerateNameContent(
      "ar-rahman",
      "reflection",
      "en",
      1,
      async () => "An English reflection.",
      (s: string) => s.trim() === ""
    );
    await getOrGenerateNameContent(
      "ar-rahman",
      "reflection",
      "tr",
      1,
      async () => "Türkçe bir yansıma.",
      (s: string) => s.trim() === ""
    );

    const rows = await db
      .select()
      .from(nameContent)
      .where(and(eq(nameContent.slug, "ar-rahman"), eq(nameContent.kind, "reflection")));

    expect(rows).toHaveLength(2);
    const byLocale = Object.fromEntries(rows.map((r) => [r.locale, JSON.parse(r.data)]));
    expect(byLocale.en).toBe("An English reflection.");
    expect(byLocale.tr).toBe("Türkçe bir yansıma.");
  });

  it("name_verse_reasons round-trips a locale-specific translation independent of the canonical row", async () => {
    const translated = await getOrGenerateVerseReason(
      "ar-rahman",
      "2:255",
      "az",
      async () => "Ayat əl-Kürsi."
    );
    expect(translated).toBe("Ayat əl-Kürsi.");

    const [row] = await db
      .select()
      .from(nameVerseReasons)
      .where(
        and(
          eq(nameVerseReasons.slug, "ar-rahman"),
          eq(nameVerseReasons.ref, "2:255"),
          eq(nameVerseReasons.locale, "az")
        )
      );
    expect(row.reason).toBe("Ayat əl-Kürsi.");

    // A different locale for the same (slug, ref) gets its own row, not an overwrite.
    await getOrGenerateVerseReason("ar-rahman", "2:255", "ru", async () => "Аят аль-Курси.");
    const rows = await db
      .select()
      .from(nameVerseReasons)
      .where(and(eq(nameVerseReasons.slug, "ar-rahman"), eq(nameVerseReasons.ref, "2:255")));
    expect(rows).toHaveLength(2);
  });

  it("a second call for the same (slug, ref, locale) reuses the cached translation without regenerating", async () => {
    let calls = 0;
    const generate = async () => {
      calls += 1;
      return "cached translation";
    };

    await getOrGenerateVerseReason("al-malik", "1:1", "tr", generate);
    await getOrGenerateVerseReason("al-malik", "1:1", "tr", generate);

    expect(calls).toBe(1);
  });
});
