import { createHash } from "node:crypto";
import { cosineDistance, desc, eq, notInArray, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/infra/db";
import { verseEmbeddings } from "@/lib/infra/db/schema";
import { embed } from "@/lib/ai/ai";
import { redisGet, redisSet } from "@/lib/infra/redis";
import { incr } from "@/lib/infra/metrics";
import { getVerses } from "@/lib/quran/quran-corpus";
import type { Verse } from "@/types/quran";

/**
 * Embeds a free-text query, caching the vector in Redis keyed by the normalized
 * query text. The live Gemini embedding call is the hardest ceiling under load
 * (free tier ~60/min), so repeated/popular searches skip it entirely. Falls back
 * to a direct embed when Redis is disabled. Only user queries are cached — corpus
 * embeddings are precomputed and never hit this path.
 */
const EMBED_CACHE_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

async function embedQueryCached(query: string): Promise<number[]> {
  const normalized = query.toLowerCase();
  const cacheKey = `emb:q:${createHash("sha256").update(normalized).digest("hex")}`;

  const cached = await redisGet(cacheKey);
  if (cached) {
    try {
      const vec = JSON.parse(cached) as number[];
      if (Array.isArray(vec) && vec.length > 0) {
        incr("embed_cache_hit");
        return vec;
      }
    } catch {
      // Corrupt entry — fall through and re-embed.
    }
  }

  incr("embed_cache_miss");
  const vec = await embed(query);
  void redisSet(cacheKey, JSON.stringify(vec), EMBED_CACHE_TTL_SECONDS);
  return vec;
}

/**
 * Semantic search over the verse corpus. Reads precomputed vectors from
 * `verse_embeddings` (seeded by scripts/embed-corpus.mjs) and ranks by cosine
 * similarity using pgvector. Powers "search by meaning", the "find similar
 * verses" affordance, and the candidate retrieval for grounded thematic /
 * contrast connection discovery — data discovers, AI articulates.
 */

export interface SemanticMatch {
  verse: Verse;
  /** Cosine similarity in [0, 1]; higher is closer in meaning. */
  similarity: number;
}

async function nearest(
  queryVec: number[],
  limit: number,
  excludeRefs: string[] = []
): Promise<Array<{ ref: string; similarity: number }>> {
  const similarity = sql<number>`1 - (${cosineDistance(verseEmbeddings.embedding, queryVec)})`;
  const where: SQL | undefined =
    excludeRefs.length > 0 ? notInArray(verseEmbeddings.ref, excludeRefs) : undefined;
  return db
    .select({ ref: verseEmbeddings.ref, similarity })
    .from(verseEmbeddings)
    .where(where)
    .orderBy(desc(similarity))
    .limit(limit);
}

async function hydrate(rows: Array<{ ref: string; similarity: number }>): Promise<SemanticMatch[]> {
  const verseMap = await getVerses(rows.map((r) => r.ref));
  return rows
    .map((r) => {
      const verse = verseMap.get(r.ref);
      return verse ? { verse, similarity: r.similarity } : null;
    })
    .filter((m): m is SemanticMatch => m !== null);
}

/** Find verses whose meaning is closest to a free-text query. */
export async function searchByMeaning(query: string, limit = 10): Promise<SemanticMatch[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const queryVec = await embedQueryCached(trimmed);
  return hydrate(await nearest(queryVec, limit));
}

/**
 * Find verses semantically nearest to a given verse (excluding itself, and any
 * additional `excludeRefs` — e.g. verses already surfaced to the caller for
 * this source+kind, so a repeat request returns something new).
 */
export async function similarVerses(
  ref: string,
  limit = 5,
  excludeRefs: string[] = []
): Promise<SemanticMatch[]> {
  const self = await db
    .select({ embedding: verseEmbeddings.embedding })
    .from(verseEmbeddings)
    .where(eq(verseEmbeddings.ref, ref))
    .limit(1);
  if (!self[0]) return [];
  return hydrate(await nearest(self[0].embedding, limit, [ref, ...excludeRefs]));
}

/**
 * Candidate target refs for grounded connection discovery: the N verses nearest
 * in meaning to `ref`, as plain refs (the generator hydrates + articulates).
 * Returns [] when the source verse has no stored embedding.
 */
export async function semanticCandidates(
  ref: string,
  limit = 10,
  excludeRefs: string[] = []
): Promise<string[]> {
  const matches = await similarVerses(ref, limit, excludeRefs);
  return matches.map((m) => m.verse.ref);
}
