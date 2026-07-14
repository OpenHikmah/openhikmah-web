import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/infra/db";
import { verseNotes } from "@/lib/infra/db/schema";
import { requireUser } from "@/lib/auth/social-auth";
import { isValidRef } from "@/lib/quran/quran-corpus";
import { jsonError, parseJson } from "@/lib/infra/http";
import { rateLimitOrNull } from "@/lib/infra/rate-limit";

// A study note is free text, not a serialized payload (contrast with
// workspace's 512KB canvas cap) — bounded generously for a long personal
// reflection while still closing the unbounded-text DB bloat gap.
const MAX_NOTE_LENGTH = 10_000;

export async function GET(req: NextRequest) {
  const authed = await requireUser(req);
  if (authed instanceof NextResponse) return authed;

  const ref = req.nextUrl.searchParams.get("ref");
  if (!ref || !isValidRef(ref)) {
    return jsonError("Invalid or missing ref", 400);
  }

  try {
    const notes = await db
      .select()
      .from(verseNotes)
      .where(and(eq(verseNotes.userId, authed.userId), eq(verseNotes.verseRef, ref)));

    return NextResponse.json(notes);
  } catch (err) {
    console.error("notes GET db error:", err);
    return jsonError("Internal server error", 500);
  }
}

export async function POST(req: NextRequest) {
  const authed = await requireUser(req);
  if (authed instanceof NextResponse) return authed;

  const limited = await rateLimitOrNull(
    `notes:${authed.userId}`,
    "Too many notes created — try again later"
  );
  if (limited) return limited;

  const body = await parseJson<{ ref?: string; note?: string }>(req);
  if (!body) return jsonError("Invalid request body", 400);

  const ref = body.ref?.trim();
  const note = body.note?.trim();
  if (!ref || !isValidRef(ref)) {
    return jsonError("Invalid verse ref", 400);
  }
  if (!note) {
    return jsonError("Missing note", 400);
  }
  if (note.length > MAX_NOTE_LENGTH) {
    return jsonError(`Note too long (max ${MAX_NOTE_LENGTH} characters)`, 400);
  }

  try {
    const [inserted] = await db
      .insert(verseNotes)
      .values({ userId: authed.userId, verseRef: ref, note })
      .returning();

    return NextResponse.json(inserted, { status: 201 });
  } catch (err) {
    console.error("notes POST db error:", err);
    return jsonError("Internal server error", 500);
  }
}
