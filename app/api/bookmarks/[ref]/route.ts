import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/infra/db";
import { bookmarks } from "@/lib/infra/db/schema";
import { requireUser } from "@/lib/auth/social-auth";
import { jsonError } from "@/lib/infra/http";
import { rateLimitOrNull } from "@/lib/infra/rate-limit";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ ref: string }> }) {
  const authed = await requireUser(req);
  if (authed instanceof NextResponse) return authed;

  const limited = await rateLimitOrNull("bookmark:" + authed.userId, "Too many bookmarks");
  if (limited) return limited;

  const { ref } = await params;
  const verseRef = ref.trim();
  if (!verseRef) return jsonError("Invalid verse ref", 400);

  try {
    // Match both the raw param and its trimmed form. POST trims on write, so a
    // bookmark saved as "2:255" must be removable by a client that sent
    // " 2:255 "; matching the raw value too keeps a legacy row stored under a
    // non-canonical key (writable before isValidRef was tightened) deletable.
    // Query is userId-scoped and parameterized, so no validation is needed here.
    await db
      .delete(bookmarks)
      .where(
        and(
          eq(bookmarks.userId, authed.userId),
          inArray(bookmarks.verseRef, [...new Set([ref, verseRef])])
        )
      );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("bookmarks DELETE db error:", err);
    return jsonError("Internal server error", 500);
  }
}
