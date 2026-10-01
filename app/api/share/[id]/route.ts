import { NextResponse } from "next/server";
import { clientKey } from "@/lib/infra/http";
import { rateLimitOrNull } from "@/lib/infra/rate-limit";
import { hydrateSharePayload, loadSharePayload } from "@/lib/canvas/share-hydrate";

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
    const loaded = await loadSharePayload(id);
    if (loaded.status === "missing") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (loaded.status === "corrupt") {
      return NextResponse.json({ error: "Corrupted canvas data" }, { status: 500 });
    }

    const canvas = await hydrateSharePayload(loaded.payload);
    if (!canvas) {
      return NextResponse.json({ error: "Could not load verses" }, { status: 500 });
    }
    return NextResponse.json(canvas);
  } catch (err) {
    console.error("share GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
