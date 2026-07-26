import { NextResponse } from "next/server";
import { db } from "@/lib/infra/db";
import { sharedCanvases } from "@/lib/infra/db/schema";
import { eq } from "drizzle-orm";
import { clientKey } from "@/lib/infra/http";
import { rateLimitOrNull } from "@/lib/infra/rate-limit";

// Public, unauthenticated route over a UUID keyspace — rate limit per-IP to
// bound both DB load and brute-force ID guessing, matching POST /api/share.
const SHARE_GET_LIMIT = 60;
const SHARE_GET_WINDOW_SECONDS = 60 * 60;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const limited = await rateLimitOrNull(
    `share-get:${clientKey(req)}`,
    "Too many requests",
    SHARE_GET_LIMIT,
    SHARE_GET_WINDOW_SECONDS
  );
  if (limited) return limited;

  const { id } = await params;

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const rows = await db.select().from(sharedCanvases).where(eq(sharedCanvases.id, id)).limit(1);

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
