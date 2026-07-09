import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/infra/db";
import { verseNotes } from "@/lib/infra/db/schema";
import { requireUser } from "@/lib/auth/social-auth";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authed = await requireUser(req);
  if (authed instanceof NextResponse) return authed;

  const { id } = await params;
  const noteId = parseInt(id, 10);
  if (isNaN(noteId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  try {
    const deleted = await db
      .delete(verseNotes)
      .where(and(eq(verseNotes.id, noteId), eq(verseNotes.userId, authed.userId)))
      .returning();

    if (deleted.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error("notes DELETE db error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
