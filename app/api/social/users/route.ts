import { NextRequest, NextResponse } from "next/server";
import { and, eq, ne, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { friendships, users } from "@/lib/db/schema";
import { requireUser } from "@/lib/social-auth";

/**
 * User search for the add-friend flow: case-insensitive partial username match,
 * excluding self, capped at 10. Each result carries the viewer's relationship
 * status so the UI can show the right action (Add / Pending / Friends).
 */
export async function GET(req: NextRequest) {
  const authed = await requireUser(req);
  if (authed instanceof NextResponse) return authed;

  const { userId } = authed;
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) return NextResponse.json([]);

  const matches = await db
    .select({ id: users.id, username: users.username, displayName: users.displayName })
    .from(users)
    .where(and(sql`${users.username} ILIKE ${"%" + q + "%"}`, ne(users.id, userId)))
    .orderBy(users.username)
    .limit(10);

  if (matches.length === 0) return NextResponse.json([]);

  // Relationship status to each match, in either direction.
  const rels = await db
    .select({
      requesterId: friendships.requesterId,
      addresseeId: friendships.addresseeId,
      status: friendships.status,
    })
    .from(friendships)
    .where(or(eq(friendships.requesterId, userId), eq(friendships.addresseeId, userId)));

  const statusFor = (
    otherId: number
  ): "none" | "accepted" | "pending_sent" | "pending_received" => {
    const rel = rels.find(
      (r) =>
        (r.requesterId === userId && r.addresseeId === otherId) ||
        (r.requesterId === otherId && r.addresseeId === userId)
    );
    if (!rel || rel.status === "declined") return "none";
    if (rel.status === "accepted") return "accepted";
    return rel.requesterId === userId ? "pending_sent" : "pending_received";
  };

  return NextResponse.json(
    matches.map((u) => ({
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      status: statusFor(u.id),
    }))
  );
}
