import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import type { User } from "@/lib/infra/db/schema";

vi.mock("@/lib/admin/admin-auth", () => ({
  requireAdmin: vi.fn(async () => ({ userId: 1, user: { qfId: "qf-admin" } as User })),
  rateLimitAdminMutation: vi.fn(() => null),
}));
vi.mock("@/lib/admin/admin-audit", () => ({ logAdminAction: vi.fn() }));

import { db } from "@/lib/infra/db";
import { nameContent, nameVerseReasons, verses } from "@/lib/infra/db/schema";
import { PATCH } from "@/app/api/admin/names/route";

// Ayat al-Kursi (2:255) exactly as the corpus stores it.
const ARABIC_2_255 = "اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ";
const SAHEEH_2_255 =
  "Allah - there is no deity except Him, the Ever-Living, the Sustainer of existence.";

function patch(body: unknown) {
  return new NextRequest("http://localhost/api/admin/names", {
    method: "PATCH",
    headers: { Authorization: "Bearer t", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(async () => {
  await db.delete(nameVerseReasons);
  await db.delete(nameContent);
  await db.delete(verses);
  await db.insert(verses).values({
    ref: "2:255",
    surah: 2,
    ayah: 255,
    arabicText: ARABIC_2_255,
    translation: SAHEEH_2_255,
  });
});

describe("PATCH /api/admin/names (integration, real Postgres)", () => {
  it("edits only the en row and clears the localized rows so they regenerate", async () => {
    await db.insert(nameContent).values([
      { slug: "ar-rahman", kind: "reflection", locale: "en", data: JSON.stringify("Old English.") },
      { slug: "ar-rahman", kind: "reflection", locale: "tr", data: JSON.stringify("Eski Turkce.") },
      { slug: "al-malik", kind: "reflection", locale: "tr", data: JSON.stringify("Baska isim.") },
    ]);

    const res = await PATCH(
      patch({ slug: "ar-rahman", kind: "reflection", data: "A believer's reflection." })
    );
    expect(res.status).toBe(200);

    const rows = await db.select().from(nameContent);
    const byKey = new Map(rows.map((r) => [`${r.slug}/${r.kind}/${r.locale}`, r.data]));
    expect(byKey.get("ar-rahman/reflection/en")).toBe(JSON.stringify("A believer's reflection."));
    // The Turkish row was translated from the old English: gone, not overwritten with English.
    expect(byKey.has("ar-rahman/reflection/tr")).toBe(false);
    // Other names are untouched.
    expect(byKey.get("al-malik/reflection/tr")).toBe(JSON.stringify("Baska isim."));
  });

  it("stores corpus text for edited verses and clears that name's localized reasons only", async () => {
    await db.insert(nameContent).values({
      slug: "ar-rahman",
      kind: "verses",
      locale: "en",
      data: JSON.stringify([]),
    });
    await db.insert(nameVerseReasons).values([
      { slug: "ar-rahman", ref: "2:255", locale: "tr", reason: "Eski neden." },
      { slug: "al-malik", ref: "2:255", locale: "tr", reason: "Baska isim." },
    ]);

    const res = await PATCH(
      patch({
        slug: "ar-rahman",
        kind: "verses",
        data: [
          {
            ref: "2:255",
            arabicText: "altered",
            translation: "altered",
            reason: "Affirms the Ever-Living attribute.",
          },
        ],
      })
    );
    expect(res.status).toBe(200);

    const [row] = await db.select().from(nameContent).where(eq(nameContent.kind, "verses"));
    const stored = JSON.parse(row.data) as Array<Record<string, unknown>>;
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      ref: "2:255",
      arabicText: ARABIC_2_255,
      translation: SAHEEH_2_255,
      reason: "Affirms the Ever-Living attribute.",
    });

    const reasons = await db.select().from(nameVerseReasons);
    expect(reasons.map((r) => r.slug)).toEqual(["al-malik"]);
  });

  it("persists nothing when validation fails", async () => {
    await db.insert(nameContent).values([
      { slug: "ar-rahman", kind: "reflection", locale: "en", data: JSON.stringify("Old English.") },
      { slug: "ar-rahman", kind: "reflection", locale: "tr", data: JSON.stringify("Eski Turkce.") },
    ]);

    const res = await PATCH(
      patch({
        slug: "ar-rahman",
        kind: "reflection",
        data: "Allah takes the physical form of a radiant light.",
      })
    );
    expect(res.status).toBe(400);

    const rows = await db.select().from(nameContent);
    expect(rows.map((r) => `${r.locale}:${r.data}`).sort()).toEqual([
      `en:${JSON.stringify("Old English.")}`,
      `tr:${JSON.stringify("Eski Turkce.")}`,
    ]);
  });
});
