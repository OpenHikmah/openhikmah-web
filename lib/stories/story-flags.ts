import { eq } from "drizzle-orm";
import { db } from "@/lib/infra/db";
import { storyFlags } from "@/lib/infra/db/schema";

export interface StoryFlag {
  slug: string;
  reason: string | null;
  flaggedBy: string | null;
  flaggedAt: Date;
}

/** Slugs currently hidden from production. */
export async function getHiddenSlugs(): Promise<Set<string>> {
  const rows = await db.select({ slug: storyFlags.slug }).from(storyFlags);
  return new Set(rows.map((r) => r.slug));
}

/** Every flag row, for the admin catalog view. */
export async function getAllFlags(): Promise<StoryFlag[]> {
  return db.select().from(storyFlags);
}

/** Hides a story slug from production (upsert — re-flagging updates the reason/admin/timestamp). */
export async function flagStory(slug: string, reason: string | null, adminQfId: string) {
  await db
    .insert(storyFlags)
    .values({ slug, reason, flaggedBy: adminQfId, flaggedAt: new Date() })
    .onConflictDoUpdate({
      target: storyFlags.slug,
      set: { reason, flaggedBy: adminQfId, flaggedAt: new Date() },
    });
}

/** Restores a story slug to production. */
export async function unflagStory(slug: string) {
  await db.delete(storyFlags).where(eq(storyFlags.slug, slug));
}
