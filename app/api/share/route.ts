import { NextResponse } from "next/server";
import { lt } from "drizzle-orm";
import { db } from "@/lib/infra/db";
import { sharedCanvases } from "@/lib/infra/db/schema";
import { clientKey } from "@/lib/infra/http";
import { rateLimitOrNull } from "@/lib/infra/rate-limit";
import { isValidNode } from "@/lib/canvas/share-canvas";

const MAX_BYTES = 512 * 1024; // 512 KB
const RATE_LIMIT = 10;
const WINDOW_SECONDS = 60 * 60; // 1 hour
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export async function POST(req: Request) {
  const limited = await rateLimitOrNull(
    `share:${clientKey(req)}`,
    "Too many requests",
    RATE_LIMIT,
    WINDOW_SECONDS
  );
  if (limited) return limited;

  const now = Date.now();
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
    (body as { nodes: unknown[] }).nodes.length === 0 ||
    !(body as { nodes: unknown[] }).nodes.every(isValidNode)
  ) {
    return NextResponse.json({ error: "Invalid canvas" }, { status: 400 });
  }

  if (Math.random() < 0.05) {
    db.delete(sharedCanvases)
      .where(lt(sharedCanvases.createdAt, new Date(now - TTL_MS)))
      .catch((err) => console.error("share TTL cleanup error:", err));
  }

  const id = crypto.randomUUID();
  await db.insert(sharedCanvases).values({ id, data: JSON.stringify(body) });
  return NextResponse.json({ id });
}
