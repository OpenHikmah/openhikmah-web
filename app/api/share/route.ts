import { NextResponse } from "next/server";
import { lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { sharedCanvases } from "@/lib/db/schema";
import { clientKey } from "@/lib/http";

const MAX_BYTES = 512 * 1024; // 512 KB
const RATE_LIMIT = 10;
const WINDOW_MS = 60 * 60 * 1000; // 1 hour
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const ipBuckets = new Map<string, { count: number; windowStart: number }>();

export async function POST(req: Request) {
  const ip = clientKey(req);
  const now = Date.now();
  const bucket = ipBuckets.get(ip);
  if (!bucket || now - bucket.windowStart > WINDOW_MS) {
    ipBuckets.set(ip, { count: 1, windowStart: now });
    // Opportunistically evict expired buckets so the map can't grow unbounded.
    if (Math.random() < 0.05) {
      for (const [key, b] of ipBuckets) {
        if (now - b.windowStart > WINDOW_MS) ipBuckets.delete(key);
      }
    }
  } else {
    bucket.count += 1;
    if (bucket.count > RATE_LIMIT) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }
  }
  let body: unknown;
  try {
    const text = await req.text();
    if (Buffer.byteLength(text, "utf8") > MAX_BYTES) {
      return NextResponse.json({ error: "Canvas too large" }, { status: 413 });
    }
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (
    typeof body !== "object" ||
    body === null ||
    (body as { v?: unknown }).v !== 1 ||
    !Array.isArray((body as { nodes?: unknown }).nodes) ||
    (body as { nodes: unknown[] }).nodes.length === 0
  ) {
    return NextResponse.json({ error: "Invalid canvas" }, { status: 400 });
  }

  if (Math.random() < 0.05) {
    db.delete(sharedCanvases)
      .where(lt(sharedCanvases.createdAt, new Date(now - TTL_MS)))
      .catch(() => {});
  }

  const id = crypto.randomUUID();
  await db.insert(sharedCanvases).values({ id, data: JSON.stringify(body) });
  return NextResponse.json({ id });
}
