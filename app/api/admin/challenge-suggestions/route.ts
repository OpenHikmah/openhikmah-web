import { NextRequest, NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/admin-auth";
import { logAdminAction } from "@/lib/admin-audit";
import { db } from "@/lib/db";
import { challengeSuggestions } from "@/lib/db/schema";
import { isDuration } from "@/lib/challenges";
import { isValidRef } from "@/lib/quran-corpus";

/** Validates an incoming suggestion payload; returns an error string or null. */
function validate(body: {
  title?: unknown;
  verseRef?: unknown;
  suggestedDuration?: unknown;
  isActive?: unknown;
}): string | null {
  if (typeof body.title !== "string" || !body.title.trim()) return "Title is required";
  if (body.verseRef != null && (typeof body.verseRef !== "string" || !isValidRef(body.verseRef)))
    return "Invalid verse reference";
  if (
    body.suggestedDuration != null &&
    (typeof body.suggestedDuration !== "string" || !isDuration(body.suggestedDuration))
  )
    return "Duration must be 24h, 48h, 7d, or empty";
  if (body.isActive !== undefined && typeof body.isActive !== "boolean")
    return "isActive must be a boolean";
  return null;
}

/** All suggestions (admin view), ordered for display. */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const rows = await db
    .select()
    .from(challengeSuggestions)
    .orderBy(asc(challengeSuggestions.sortOrder), asc(challengeSuggestions.id));
  return NextResponse.json({ suggestions: rows });
}

/** Create a suggestion. */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const err = validate(body);
  if (err) return NextResponse.json({ error: err }, { status: 400 });

  const [created] = await db
    .insert(challengeSuggestions)
    .values({
      title: (body.title as string).trim(),
      description: typeof body.description === "string" ? body.description.trim() || null : null,
      verseRef: typeof body.verseRef === "string" ? body.verseRef : null,
      suggestedDuration: typeof body.suggestedDuration === "string" ? body.suggestedDuration : null,
      isActive: body.isActive === undefined ? true : (body.isActive as boolean),
      sortOrder: Number.isInteger(body.sortOrder) ? (body.sortOrder as number) : 0,
      createdBy: auth.user.qfId,
    })
    .returning();

  await logAdminAction({
    adminQfId: auth.user.qfId,
    action: "suggestion.create",
    targetType: "challenge_suggestion",
    targetId: String(created.id),
    meta: { title: created.title },
  });
  return NextResponse.json({ suggestion: created }, { status: 201 });
}

/** Update a suggestion (full upsert of editable fields). */
export async function PUT(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const id = Number(body.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const err = validate(body);
  if (err) return NextResponse.json({ error: err }, { status: 400 });

  const [updated] = await db
    .update(challengeSuggestions)
    .set({
      title: (body.title as string).trim(),
      description: typeof body.description === "string" ? body.description.trim() || null : null,
      verseRef: typeof body.verseRef === "string" ? body.verseRef : null,
      suggestedDuration: typeof body.suggestedDuration === "string" ? body.suggestedDuration : null,
      isActive: body.isActive === undefined ? true : (body.isActive as boolean),
      sortOrder: Number.isInteger(body.sortOrder) ? (body.sortOrder as number) : 0,
      updatedAt: new Date(),
    })
    .where(eq(challengeSuggestions.id, id))
    .returning();

  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await logAdminAction({
    adminQfId: auth.user.qfId,
    action: "suggestion.update",
    targetType: "challenge_suggestion",
    targetId: String(id),
  });
  return NextResponse.json({ suggestion: updated });
}

/** Delete a suggestion (`?id=`). Challenges that used it keep `suggestion_id` null. */
export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const [deleted] = await db
    .delete(challengeSuggestions)
    .where(eq(challengeSuggestions.id, id))
    .returning();
  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await logAdminAction({
    adminQfId: auth.user.qfId,
    action: "suggestion.delete",
    targetType: "challenge_suggestion",
    targetId: String(id),
  });
  return new NextResponse(null, { status: 204 });
}
