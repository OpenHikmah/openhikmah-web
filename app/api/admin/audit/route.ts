import { NextRequest, NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { requireAdmin } from "@/lib/admin-auth";
import { db } from "@/lib/db";
import { adminAuditLog } from "@/lib/db/schema";

/** Most-recent admin actions (newest first). `?limit=` caps the page (default 100). */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const limitParam = Number(req.nextUrl.searchParams.get("limit"));
  const limit = Number.isInteger(limitParam) && limitParam > 0 ? Math.min(limitParam, 500) : 100;

  const rows = await db
    .select()
    .from(adminAuditLog)
    .orderBy(desc(adminAuditLog.createdAt))
    .limit(limit);

  return NextResponse.json({
    entries: rows.map((r) => ({
      id: r.id,
      adminQfId: r.adminQfId,
      action: r.action,
      targetType: r.targetType,
      targetId: r.targetId,
      meta: r.meta ? safeParse(r.meta) : null,
      createdAt: r.createdAt,
    })),
  });
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}
