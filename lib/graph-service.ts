import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { connections, type Connection } from "@/lib/db/schema";
import { generateConnections } from "@/lib/connection-generator";
import { resolveVerse } from "@/lib/verse-resolver";
import { consume, RateLimitError } from "@/lib/rate-limit";
import type { ConnectionResult, EdgeKind } from "@/types/quran";

/**
 * The persistent knowledge graph. Reads connections from Postgres; only on a
 * miss does it call the AI, then writes the result back so every later reader
 * gets it for free. This is what makes AI cost trend toward zero.
 */

interface SourceVerse {
  arabicText: string;
  translation: string;
}

interface GetConnectionsOptions {
  /** Identifier (e.g. client IP) used to rate-limit the AI generation path.
   *  When set and the client is over budget, a miss throws RateLimitError.
   *  Cache hits are never rate-limited. */
  clientKey?: string;
}

/** Hydrate stored edges (which carry only refs + reason) into full results. */
async function hydrate(rows: Connection[], kind: EdgeKind): Promise<ConnectionResult[]> {
  const resolved = await Promise.all(rows.map((r) => resolveVerse(r.toRef)));
  return rows
    .map((r, i) => {
      const verse = resolved[i];
      if (!verse) return null;
      const result: ConnectionResult = {
        surah: verse.surah,
        ayah: verse.ayah,
        ref: verse.ref,
        arabicText: verse.arabicText,
        translation: verse.translation,
        surahName: verse.surahName,
        surahNameArabic: verse.surahNameArabic,
        reason: r.reason,
        kind,
      };
      return result;
    })
    .filter((c): c is ConnectionResult => c !== null);
}

/**
 * Returns connections for a source verse and kind. Served from the DB graph when
 * present; otherwise generated, persisted, and returned. `source` text is only
 * needed for the miss path (it grounds the AI prompt).
 */
export async function getConnections(
  fromRef: string,
  kind: EdgeKind,
  source: SourceVerse,
  options: GetConnectionsOptions = {}
): Promise<ConnectionResult[]> {
  const existing = await db
    .select()
    .from(connections)
    .where(
      and(
        eq(connections.fromRef, fromRef),
        eq(connections.kind, kind),
        eq(connections.status, "active")
      )
    );

  if (existing.length > 0) {
    return hydrate(existing, kind);
  }

  // Cache miss — this is the expensive path, so rate-limit it.
  if (options.clientKey) {
    const allowed = await consume(`gen:${options.clientKey}`);
    if (!allowed) throw new RateLimitError();
  }

  // Generate, persist, return.
  const generated = await generateConnections(
    fromRef,
    source.arabicText,
    source.translation,
    kind
  );

  if (generated.length > 0) {
    const model = process.env.ANTHROPIC_MODEL ?? null;
    try {
      await db
        .insert(connections)
        .values(
          generated.map((g) => ({
            fromRef,
            toRef: g.ref,
            kind,
            reason: g.reason,
            model,
          }))
        )
        .onConflictDoNothing();
    } catch (err) {
      console.error("Failed to persist connections:", err);
    }
  }

  return generated;
}
