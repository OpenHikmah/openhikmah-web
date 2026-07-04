import { NextRequest, NextResponse } from "next/server";
import { desc, eq, ilike } from "drizzle-orm";
import { requireAdmin, isAdminQfId } from "@/lib/admin-auth";
import { logAdminAction } from "@/lib/admin-audit";
import { clearTokenCache } from "@/lib/social-auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

/** List users (newest-active first) with optional `?q=` username search. */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const q = req.nextUrl.searchParams.get("q")?.trim();
  const limitParam = Number(req.nextUrl.searchParams.get("limit"));
  const limit = Number.isInteger(limitParam) && limitParam > 0 ? Math.min(limitParam, 200) : 100;

  const rows = await db
    .select()
    .from(users)
    .where(q ? ilike(users.username, `%${q}%`) : undefined)
    .orderBy(desc(users.lastActiveAt))
    .limit(limit);

  return NextResponse.json({
    users: rows.map((u) => ({
      id: u.id,
      qfId: u.qfId,
      username: u.username,
      displayName: u.displayName,
      createdAt: u.createdAt,
      lastActiveAt: u.lastActiveAt,
      currentStreak: u.currentStreak,
      longestStreak: u.longestStreak,
      disabledAt: u.disabledAt,
      isAdmin: isAdminQfId(u.qfId),
    })),
  });
}

/** Soft-disable / re-enable a user account: body `{ id, disabled: boolean }`. */
export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  let body: { id?: number; disabled?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { id, disabled } = body;
  if (!Number.isInteger(id) || typeof disabled !== "boolean") {
    return NextResponse.json({ error: "Expected { id, disabled }" }, { status: 400 });
  }

  const [target] = await db
    .select()
    .from(users)
    .where(eq(users.id, id as number))
    .limit(1);
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  // Never let an admin lock out themselves or another admin via this panel.
  if (disabled && isAdminQfId(target.qfId)) {
    return NextResponse.json({ error: "Cannot disable an admin account" }, { status: 403 });
  }

  const [updated] = await db
    .update(users)
    .set({ disabledAt: disabled ? new Date() : null })
    .where(eq(users.id, id as number))
    .returning();

  // The row could have been deleted between the select and the update.
  if (!updated) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Cached auth entries hold the pre-toggle user snapshot (≤5 min), so a freshly
  // disabled user could keep authorising until expiry. Flush the in-process token
  // cache so the change takes effect on the next request (the L2/DB re-read picks
  // up the new disabledAt).
  clearTokenCache();

  await logAdminAction({
    adminQfId: auth.user.qfId,
    action: disabled ? "user.disable" : "user.enable",
    targetType: "user",
    targetId: String(id),
    meta: { username: target.username },
  });

  return NextResponse.json({ id: updated.id, disabledAt: updated.disabledAt });
}
