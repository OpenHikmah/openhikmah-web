import { and, desc, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { db } from "@/lib/infra/db";
import { wordMorphology } from "@/lib/infra/db/schema";
import { semanticCandidates } from "@/lib/quran/semantic-search";
import type { EdgeKind } from "@/types/quran";

/**
 * Candidate discovery for grounded connections — the "data discovers" half of the
 * separation of powers. Given a source verse and a connection kind, returns REAL
 * candidate target refs drawn from canonical data:
 *
 *   - root      → verses sharing an Arabic root (from the seeded word_morphology
 *                 table), ranked by number of shared roots.
 *   - thematic  → verses nearest in meaning (embedding similarity).
 *   - contrast  → meaning-neighbors too; the articulation step selects the
 *                 genuinely opposing ones.
 *
 * The AI never invents these refs; it only selects among them and explains why.
 * Returns [] when the grounding data isn't seeded for this verse — callers then
 * fall back to legacy generation (see lib/connection-generator.ts).
 */

/** Verses sharing an Arabic root with the source verse, most-shared first. */
async function rootCandidates(fromRef: string, limit: number): Promise<string[]> {
  const srcRoots = await db
    .selectDistinct({ root: wordMorphology.root })
    .from(wordMorphology)
    .where(and(eq(wordMorphology.ref, fromRef), isNotNull(wordMorphology.root)));

  const roots = srcRoots.map((r) => r.root).filter((r): r is string => r !== null);
  if (roots.length === 0) return [];

  const sharedRoots = sql<number>`count(distinct ${wordMorphology.root})`;
  const rows = await db
    .select({ ref: wordMorphology.ref, shared: sharedRoots })
    .from(wordMorphology)
    .where(and(inArray(wordMorphology.root, roots), ne(wordMorphology.ref, fromRef)))
    .groupBy(wordMorphology.ref)
    .orderBy(desc(sharedRoots))
    .limit(limit);

  return rows.map((r) => r.ref);
}

/**
 * Returns up to `limit` real candidate refs for the given source verse and kind.
 * Empty array means "no grounding data available for this verse" — not an error.
 */
export async function discoverCandidates(
  fromRef: string,
  kind: EdgeKind,
  limit = 12
): Promise<string[]> {
  if (kind === "root") return rootCandidates(fromRef, limit);
  // thematic + contrast both start from semantic neighbors.
  return semanticCandidates(fromRef, limit);
}
