import { resolveVerse } from "@/lib/verse-resolver";
import type { Verse } from "@/types/quran";

/**
 * Verse of the Day. Per the product decision: an admin-curated entry overrides
 * when present (future — see the Admin panel sub-plan), and this algorithmic pick
 * is the always-on fallback. Deterministic by UTC date over a curated pool of
 * well-known, contemplative verses, so the same verse shows all day and rotates
 * predictably without any backend curation.
 */

const POOL = [
  "1:1", "2:255", "112:1", "55:1", "24:35", "2:153", "94:5", "3:18",
  "13:28", "65:3", "2:286", "39:53", "93:5", "17:80", "25:74", "14:7",
] as const;

function daySeed(date: Date): number {
  const key = `${date.getUTCFullYear()}-${date.getUTCMonth() + 1}-${date.getUTCDate()}`;
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return hash;
}

/** The deterministic ref chosen for a given day. */
export function verseOfDayRef(date: Date = new Date()): string {
  return POOL[daySeed(date) % POOL.length];
}

/** Resolves today's verse (full text). Null only if it can't be resolved at all. */
export async function getVerseOfDay(date: Date = new Date()): Promise<Verse | null> {
  // TODO: check an admin-curated `verse_of_day` entry for this date first.
  return resolveVerse(verseOfDayRef(date));
}
