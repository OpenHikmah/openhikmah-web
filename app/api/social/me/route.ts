import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { requireUser } from "@/lib/social-auth";
import { effectiveStreak } from "@/lib/streak";
import { isUniqueViolation } from "@/lib/http";

export async function GET(req: NextRequest) {
  const authed = await requireUser(req);
  if (authed instanceof NextResponse) return authed;

  const { user } = authed;
  return NextResponse.json({
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    currentStreak: effectiveStreak(user.currentStreak, user.lastActivityDate),
    longestStreak: user.longestStreak,
    lastActivityDate: user.lastActivityDate,
    createdAt: user.createdAt,
  });
}

export async function PATCH(req: NextRequest) {
  const authed = await requireUser(req);
  if (authed instanceof NextResponse) return authed;

  let body: { username?: string; displayName?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const updates: { username?: string; displayName?: string | null } = {};

  if (body.username !== undefined) {
    const u = body.username.trim();
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(u)) {
      return NextResponse.json(
        { error: "Username must be 3–20 characters: letters, numbers, underscores only" },
        { status: 400 }
      );
    }
    // Check uniqueness
    const [collision] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, u))
      .limit(1);
    if (collision && collision.id !== authed.userId) {
      return NextResponse.json({ error: "Username already taken" }, { status: 409 });
    }
    updates.username = u;
  }

  if (body.displayName !== undefined) {
    const d = body.displayName.trim().slice(0, 50);
    updates.displayName = d || null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  try {
    const [updated] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, authed.userId))
      .returning();

    return NextResponse.json({
      id: updated.id,
      username: updated.username,
      displayName: updated.displayName,
    });
  } catch (err) {
    // The collision check above has a TOCTOU window: two concurrent PATCHes
    // picking the same free username can both pass it, then race the UPDATE
    // itself — catch that at the DB's unique constraint instead of 500ing.
    if (isUniqueViolation(err)) {
      return NextResponse.json({ error: "Username already taken" }, { status: 409 });
    }
    console.error("social/me PATCH db error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
