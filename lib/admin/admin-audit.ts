import { db } from "@/lib/infra/db";
import { adminAuditLog } from "@/lib/infra/db/schema";

/**
 * Serialize `meta` defensively: a BigInt or circular reference must not throw and
 * cause the whole audit row to be dropped. Falls back to a marker so the action
 * is still recorded.
 */
function serializeMeta(meta: unknown): string | null {
  if (meta === undefined) return null;
  try {
    return JSON.stringify(meta, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
  } catch {
    return JSON.stringify({ serializationError: true });
  }
}

/**
 * Append one row to the admin audit log. Every *mutating* admin action calls this
 * so the console polices itself (who did what, when, to which target).
 *
 * Best-effort: a logging failure must never break the action it records, so this
 * swallows errors (and logs to the server console). Callers should `await` it but
 * can ignore the result.
 */
export async function logAdminAction(entry: {
  adminQfId: string;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  meta?: unknown;
}): Promise<void> {
  try {
    await db.insert(adminAuditLog).values({
      adminQfId: entry.adminQfId,
      action: entry.action,
      targetType: entry.targetType ?? null,
      targetId: entry.targetId ?? null,
      meta: serializeMeta(entry.meta),
    });
  } catch (err) {
    console.error("Failed to write admin audit log:", entry.action, err);
  }
}
