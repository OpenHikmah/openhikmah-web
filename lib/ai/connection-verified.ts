import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/infra/db";
import { connections, connectionCoverage } from "@/lib/infra/db/schema";
import type { EdgeKind } from "@/types/quran";

/**
 * Records that every active English connection of a (verse, kind) cell has been
 * through `verifyConnections`: at generation time, or by the re-verification
 * job. The marker is per cell because the verifier is called per cell. Creates
 * the coverage row if the cell has none (a live-generated cell), seeding
 * `activeCount` from the real rows; an existing row keeps its other fields.
 */
export async function markCellVerified(
  fromRef: string,
  kind: EdgeKind,
  at: Date = new Date()
): Promise<void> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(connections)
    .where(
      and(
        eq(connections.fromRef, fromRef),
        eq(connections.kind, kind),
        eq(connections.locale, "en"),
        eq(connections.status, "active")
      )
    );
  await db
    .insert(connectionCoverage)
    .values({ fromRef, kind, locale: "en", activeCount: count, verifiedAt: at, updatedAt: at })
    .onConflictDoUpdate({
      target: [connectionCoverage.fromRef, connectionCoverage.kind, connectionCoverage.locale],
      set: { verifiedAt: at, updatedAt: at },
    });
}
