import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { savedWorkspaces } from "@/lib/db/schema";
import { requireUser } from "@/lib/social-auth";

export async function GET(req: NextRequest) {
  const authed = await requireUser(req);
  if (authed instanceof NextResponse) return authed;

  try {
    const rows = await db
      .select({
        id: savedWorkspaces.id,
        name: savedWorkspaces.name,
        nodeCount: savedWorkspaces.nodeCount,
        createdAt: savedWorkspaces.createdAt,
        updatedAt: savedWorkspaces.updatedAt,
      })
      .from(savedWorkspaces)
      .where(eq(savedWorkspaces.userId, authed.userId))
      .orderBy(desc(savedWorkspaces.updatedAt))
      // Bound the list: most recently updated first, capped well above realistic use.
      .limit(500);

    return NextResponse.json(rows);
  } catch (err) {
    console.error("workspace GET db error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const authed = await requireUser(req);
  if (authed instanceof NextResponse) return authed;

  let body: { name?: string; data?: unknown; nodeCount?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (!body.data) {
    return NextResponse.json({ error: "Missing data" }, { status: 400 });
  }

  const data = JSON.stringify(body.data);
  if (data.length > 512 * 1024) {
    return NextResponse.json({ error: "Canvas too large" }, { status: 413 });
  }

  const name = ((body.name?.trim()) || "Untitled canvas").slice(0, 120);
  const nodeCount = Math.max(
    0,
    Math.min(typeof body.nodeCount === "number" ? body.nodeCount : 0, 50000)
  );

  try {
    const [inserted] = await db
      .insert(savedWorkspaces)
      .values({
        userId: authed.userId,
        name,
        data,
        nodeCount,
      })
      .returning({ id: savedWorkspaces.id, name: savedWorkspaces.name, createdAt: savedWorkspaces.createdAt });

    return NextResponse.json(inserted, { status: 201 });
  } catch (err) {
    console.error("workspace POST db error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
