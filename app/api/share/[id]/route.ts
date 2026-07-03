import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sharedCanvases } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const rows = await db
      .select()
      .from(sharedCanvases)
      .where(eq(sharedCanvases.id, id))
      .limit(1);

    if (rows.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    try {
      return NextResponse.json(JSON.parse(rows[0].data));
    } catch (err) {
      console.error("share GET parse error:", err);
      return NextResponse.json({ error: "Corrupted canvas data" }, { status: 500 });
    }
  } catch (err) {
    console.error("share GET db error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
