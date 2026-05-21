import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { savedWorkspaces } from "@/lib/db/schema";
import { requireUser } from "@/lib/social-auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authed = await requireUser(req);
  if (authed instanceof NextResponse) return authed;

  const { id } = await params;
  const wsId = parseInt(id, 10);
  if (isNaN(wsId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const [row] = await db
    .select({ data: savedWorkspaces.data })
    .from(savedWorkspaces)
    .where(and(eq(savedWorkspaces.id, wsId), eq(savedWorkspaces.userId, authed.userId)))
    .limit(1);

  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    return NextResponse.json(JSON.parse(row.data));
  } catch {
    return NextResponse.json({ error: "Corrupted workspace data" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authed = await requireUser(req);
  if (authed instanceof NextResponse) return authed;

  const { id } = await params;
  const wsId = parseInt(id, 10);
  if (isNaN(wsId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const deleted = await db
    .delete(savedWorkspaces)
    .where(and(eq(savedWorkspaces.id, wsId), eq(savedWorkspaces.userId, authed.userId)))
    .returning({ id: savedWorkspaces.id });

  if (deleted.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return new NextResponse(null, { status: 204 });
}
