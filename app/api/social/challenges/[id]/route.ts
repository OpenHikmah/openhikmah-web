import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
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
  if (action !== "accept" && action !== "decline") {
    return NextResponse.json({ error: "action must be accept or decline" }, { status: 400 });
  }

  const [challenge] = await db
    .select()
    .from(challenges)
    .where(eq(challenges.id, challengeId))
    .limit(1);

  if (!challenge) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (challenge.challengedId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (challenge.status !== "pending") {
    return NextResponse.json({ error: "Challenge is no longer pending" }, { status: 409 });
  }

  // On accept, reset the clock from acceptance time so both parties compete the same window.
  // On decline, just flip the status.
  const now = new Date();
  const durationMs = challenge.endsAt.getTime() - challenge.startsAt.getTime();
  const setFields =
    action === "accept"
      ? { status: "active" as const, startsAt: now, endsAt: new Date(now.getTime() + durationMs) }
      : { status: "declined" as const };

  const [updated] = await db
    .update(challenges)
    .set(setFields)
    .where(eq(challenges.id, challengeId))
    .returning();

  return NextResponse.json(updated);
}
