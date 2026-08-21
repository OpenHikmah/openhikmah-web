import { NextRequest, NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/infra/db";
import { friendships } from "@/lib/infra/db/schema";
import { requireUser } from "@/lib/auth/social-auth";

export async function GET(req: NextRequest) {
  const authed = await requireUser(req);
  if (authed instanceof NextResponse) return authed;

  const { userId } = authed;

  // A direct COUNT, not a fetch-and-filter over a page of friendship rows —
  // the badge must reflect every pending request, not just however many fit
  // under a pagination limit.
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(friendships)
    .where(and(eq(friendships.addresseeId, userId), eq(friendships.status, "pending")));

  return NextResponse.json({ count });
}
