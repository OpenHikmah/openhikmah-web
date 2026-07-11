import { NextRequest, NextResponse } from "next/server";
import { and, eq, lt } from "drizzle-orm";
import { requireAdmin, rateLimitAdminMutation } from "@/lib/admin/admin-auth";
import { logAdminAction } from "@/lib/admin/admin-audit";
import { db } from "@/lib/infra/db";
import { challenges } from "@/lib/infra/db/schema";
import { resolveEndedChallenges, resolveExpiredPending } from "@/lib/social/challenges";

/**
 * Finalize every `active` challenge whose window has ended (compute scores, set
 * winners, mark completed), and every `pending` invite nobody acted on. This is
 * the manual fix for the lazy-only expiry gap — without it, an ended/ignored
 * challenge nobody loads stays `active`/`pending` indefinitely.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const limited = await rateLimitAdminMutation(auth);
  if (limited) return limited;

  try {
    const now = new Date();
    const ended = await db
      .select()
      .from(challenges)
      .where(and(eq(challenges.status, "active"), lt(challenges.endsAt, now)));
    const resolved = await resolveEndedChallenges(ended, now);

    const expiredPending = await db
      .select()
      .from(challenges)
      .where(and(eq(challenges.status, "pending"), lt(challenges.endsAt, now)));
    const expiredPendingCount = await resolveExpiredPending(expiredPending, now);

    const count = resolved.size + expiredPendingCount;

    if (count > 0) {
      await logAdminAction({
        adminQfId: auth.user.qfId,
        action: "challenge.finalize",
        targetType: "challenge",
        meta: { resolvedActive: resolved.size, expiredPending: expiredPendingCount },
      });
    }

    return NextResponse.json({ resolved: count });
  } catch (err) {
    console.error("admin challenges finalize POST db error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
