import { NextRequest, NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { challengeSuggestions } from "@/lib/db/schema";
import { requireUser } from "@/lib/social-auth";

/**
 * Active challenge suggestions for the user-facing challenges tab. Users pick one
 * to seed a challenge to a friend. Only `is_active` rows are exposed, ordered for
 * display; admin-only fields (createdBy) are dropped.
 *
 * Lives at `/api/social/challenge-suggestions` (not under `challenges/`) to avoid
 * the static-vs-dynamic sibling collision with `challenges/[id]`, which the dev
 * router resolves to the not-found page.
 */
export async function GET(req: NextRequest) {
  const authed = await requireUser(req);
  if (authed instanceof NextResponse) return authed;

  const rows = await db
    .select({
      id: challengeSuggestions.id,
      title: challengeSuggestions.title,
      description: challengeSuggestions.description,
      verseRef: challengeSuggestions.verseRef,
      suggestedDuration: challengeSuggestions.suggestedDuration,
    })
    .from(challengeSuggestions)
    .where(eq(challengeSuggestions.isActive, true))
    .orderBy(asc(challengeSuggestions.sortOrder), asc(challengeSuggestions.id));

  return NextResponse.json({ suggestions: rows });
}
