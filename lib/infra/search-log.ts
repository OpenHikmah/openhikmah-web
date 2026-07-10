import { db } from "@/lib/infra/db";
import { searchLog } from "@/lib/infra/db/schema";

/**
 * Best-effort record of a search request, for the admin analytics view
 * (popular queries + the zero-result queries content curation acts on).
 * Never throws — a logging failure must not affect the search response.
 */
export async function logSearchQuery(
  query: string,
  mode: "keyword" | "meaning",
  resultCount: number
): Promise<void> {
  try {
    await db.insert(searchLog).values({ query, mode, resultCount, zeroResult: resultCount === 0 });
  } catch (err) {
    console.error("search_log write failed:", err);
  }
}
