import { NextRequest, NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { requireAdmin } from "@/lib/admin/admin-auth";
import { db } from "@/lib/infra/db";
import { adminAuditLog } from "@/lib/infra/db/schema";
import { safeParse } from "@/lib/infra/http";

/**
 * Most-recent admin actions (newest first), paginated. `?limit=` caps the
 * page (default 100, capped at 500 — kept distinct from the project-wide
 * parsePagination default/cap since the audit log intentionally allows a
 * larger page). `?offset=` pages further back.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const limitParam = Number(req.nextUrl.searchParams.get("limit"));
  const limit = Number.isInteger(limitParam) && limitParam > 0 ? Math.min(limitParam, 500) : 100;
  const offsetParam = Number(req.nextUrl.searchParams.get("offset"));
  const offset = Number.isInteger(offsetParam) && offsetParam > 0 ? offsetParam : 0;

  try {
    // Fetch one extra row to detect whether more entries exist beyond this page.
    const rows = await db
      .select()
      .from(adminAuditLog)
      .orderBy(desc(adminAuditLog.createdAt), desc(adminAuditLog.id))
      .limit(limit + 1)
      .offset(offset);

    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);

    return NextResponse.json({
      entries: page.map((r) => ({
        id: r.id,
        adminQfId: r.adminQfId,
        action: r.action,
        targetType: r.targetType,
        targetId: r.targetId,
        meta: r.meta ? safeParse(r.meta) : null,
        createdAt: r.createdAt,
      })),
      hasMore,
    });
  } catch (err) {
    console.error("admin audit GET db error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
