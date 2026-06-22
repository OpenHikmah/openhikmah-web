import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/admin-auth";
import { logAdminAction } from "@/lib/admin-audit";
import { db } from "@/lib/db";
import { challenges } from "@/lib/db/schema";
import { scoreChallenge, pickWinner } from "@/lib/challenges";

/**
 * Moderate a single challenge:
 *  - `end`            — end an active challenge now (score + finalize a winner).
 *  - `override-winner`— force the winner (`winnerId`: challenger id, challenged id,
 *                       or null for a draw) and mark it completed.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const challengeId = Number((await params).id);
  if (!Number.isInteger(challengeId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  let body: { action?: string; winnerId?: number | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const [challenge] = await db.select().from(challenges).where(eq(challenges.id, challengeId)).limit(1);
  if (!challenge) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (body.action === "end") {
    if (challenge.status !== "active") {
      return NextResponse.json({ error: "Only active challenges can be ended" }, { status: 409 });
    }
    const now = new Date();
    const ended = { ...challenge, endsAt: now };
    const [challengerScore, challengedScore] = await Promise.all([
      scoreChallenge(challenge.challengerId, ended),
      scoreChallenge(challenge.challengedId, ended),
    ]);
    const winnerId = pickWinner(challenge, challengerScore, challengedScore);
    const [updated] = await db
      .update(challenges)
      .set({ status: "completed", winnerId, endsAt: now })
      .where(eq(challenges.id, challengeId))
      .returning();
    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    await logAdminAction({
      adminQfId: auth.user.qfId,
      action: "challenge.end",
      targetType: "challenge",
      targetId: String(challengeId),
      meta: { winnerId, challengerScore, challengedScore },
    });
    return NextResponse.json({ challenge: updated });
  }

  if (body.action === "override-winner") {
    const winnerId = body.winnerId ?? null;
    if (winnerId !== null && winnerId !== challenge.challengerId && winnerId !== challenge.challengedId) {
      return NextResponse.json({ error: "winnerId must be a participant or null" }, { status: 400 });
    }
    const [updated] = await db
      .update(challenges)
      .set({ status: "completed", winnerId })
      .where(eq(challenges.id, challengeId))
      .returning();
    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    await logAdminAction({
      adminQfId: auth.user.qfId,
      action: "challenge.override-winner",
      targetType: "challenge",
      targetId: String(challengeId),
      meta: { winnerId },
    });
    return NextResponse.json({ challenge: updated });
  }

  return NextResponse.json({ error: "action must be end or override-winner" }, { status: 400 });
}

/** Void (hard-delete) a challenge — for spam/abuse. */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const challengeId = Number((await params).id);
  if (!Number.isInteger(challengeId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const [deleted] = await db.delete(challenges).where(eq(challenges.id, challengeId)).returning();
  if (!deleted) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await logAdminAction({
    adminQfId: auth.user.qfId,
    action: "challenge.void",
    targetType: "challenge",
    targetId: String(challengeId),
  });
  return new NextResponse(null, { status: 204 });
}
