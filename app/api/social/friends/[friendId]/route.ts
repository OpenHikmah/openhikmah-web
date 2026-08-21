import { NextRequest, NextResponse } from "next/server";
import { and, eq, or } from "drizzle-orm";
import { db } from "@/lib/infra/db";
import { friendships } from "@/lib/infra/db/schema";
import { requireUser } from "@/lib/auth/social-auth";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ friendId: string }> }
) {
  const authed = await requireUser(req);
  if (authed instanceof NextResponse) return authed;

  const { friendId } = await params;
  const friendshipId = parseInt(friendId, 10);
  if (!friendshipId) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  let body: { action?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { action } = body;
  if (action !== "accept" && action !== "decline") {
    return NextResponse.json({ error: "action must be 'accept' or 'decline'" }, { status: 400 });
  }

  const { userId } = authed;

  // Only the addressee can accept/decline
  const [row] = await db
    .select()
    .from(friendships)
    .where(and(eq(friendships.id, friendshipId), eq(friendships.addresseeId, userId)))
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: "Not found or not your request to answer" }, { status: 404 });
  }

  if (row.status !== "pending") {
    return NextResponse.json({ error: "Request already resolved" }, { status: 409 });
  }

  // Re-check `status = "pending"` in the mutation's own WHERE (not just the
  // read above) so two concurrent accept/decline calls can't both pass the
  // read and then both mutate — whichever loses the race affects zero rows
  // and gets a 409 instead of silently succeeding or throwing on a missing row.
  const pendingGuard = and(
    eq(friendships.id, friendshipId),
    eq(friendships.addresseeId, userId),
    eq(friendships.status, "pending")
  );

  if (action === "decline") {
    // Declines are deleted outright rather than kept as a "declined" row —
    // a re-request after a decline should look identical to a first-time
    // request, and nothing reads declined history.
    const deleted = await db.delete(friendships).where(pendingGuard).returning();
    if (deleted.length === 0) {
      return NextResponse.json({ error: "Request already resolved" }, { status: 409 });
    }
    return NextResponse.json({ id: friendshipId, status: "declined" });
  }

  const [updated] = await db
    .update(friendships)
    .set({ status: "accepted", updatedAt: new Date() })
    .where(pendingGuard)
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Request already resolved" }, { status: 409 });
  }

  return NextResponse.json({ id: updated.id, status: updated.status });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ friendId: string }> }
) {
  const authed = await requireUser(req);
  if (authed instanceof NextResponse) return authed;

  const { friendId } = await params;
  const friendshipId = parseInt(friendId, 10);
  if (!friendshipId) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const { userId } = authed;

  // Either party can remove the friendship
  const [row] = await db
    .select({ id: friendships.id })
    .from(friendships)
    .where(
      and(
        eq(friendships.id, friendshipId),
        or(eq(friendships.requesterId, userId), eq(friendships.addresseeId, userId))
      )
    )
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db.delete(friendships).where(eq(friendships.id, friendshipId));

  return NextResponse.json({ ok: true });
}
