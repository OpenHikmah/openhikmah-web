import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { challenges } from "@/lib/db/schema";
import { requireUser } from "@/lib/social-auth";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authed = await requireUser(req);
  if (authed instanceof NextResponse) return authed;
  const { userId } = authed;

  const { id } = await params;
  const challengeId = parseInt(id, 10);
  if (isNaN(challengeId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: { action?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { action } = body;
  if (action !== "accept" && action !== "decline" && action !== "cancel") {
    return NextResponse.json({ error: "action must be accept, decline, or cancel" }, { status: 400 });
  }

  const [challenge] = await db
    .select()
    .from(challenges)
    .where(eq(challenges.id, challengeId))
    .limit(1);

  if (!challenge) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  // accept/decline are the challenged party's; cancel is the challenger's (withdraw).
  const requiredUser = action === "cancel" ? challenge.challengerId : challenge.challengedId;
  if (requiredUser !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (challenge.status !== "pending") {
    return NextResponse.json({ error: "Challenge is no longer pending" }, { status: 409 });
  }

  // On accept, reset the clock from acceptance time so both parties compete the same
  // window. Decline/cancel just flip the status (cancelled = challenger withdrew).
  const now = new Date();
  const durationMs = challenge.endsAt.getTime() - challenge.startsAt.getTime();
  const setFields =
    action === "accept"
      ? { status: "active" as const, startsAt: now, endsAt: new Date(now.getTime() + durationMs) }
      : action === "decline"
        ? { status: "declined" as const }
        : { status: "cancelled" as const };

  // Scope the WHERE to "still pending" — otherwise two concurrent calls (e.g.
  // accept racing cancel) both pass the check above and the second write
  // silently clobbers the first.
  const [updated] = await db
    .update(challenges)
    .set(setFields)
    .where(and(eq(challenges.id, challengeId), eq(challenges.status, "pending")))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Challenge is no longer pending" }, { status: 409 });
  }

  return NextResponse.json(updated);
}
