import { NextRequest, NextResponse } from "next/server";
import { and, eq, lt } from "drizzle-orm";
import { requireAdmin } from "@/lib/admin-auth";
import { logAdminAction } from "@/lib/admin-audit";
import { db } from "@/lib/db";
import { challenges } from "@/lib/db/schema";
import { resolveEndedChallenges } from "@/lib/challenges";

/**
 * Finalize every `active` challenge whose window has ended (compute scores, set
 * winners, mark completed). This is the manual fix for the lazy-only expiry gap —
 * without it, an ended challenge nobody loads stays `active` indefinitely.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const now = new Date();
    const ended = await db
      .select()
      .from(challenges)
      .where(and(eq(challenges.status, "active"), lt(challenges.endsAt, now)));

    const resolved = await resolveEndedChallenges(ended, now);
    const count = resolved.size;

    if (count > 0) {
      await logAdminAction({
        adminQfId: auth.user.qfId,
        action: "challenge.finalize",
        targetType: "challenge",
        meta: { resolved: count },
      });
    }

    return NextResponse.json({ resolved: count });
  } catch (err) {
    console.error("admin challenges finalize POST db error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
