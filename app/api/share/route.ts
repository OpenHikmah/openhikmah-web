import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sharedCanvases } from "@/lib/db/schema";

const MAX_BYTES = 512 * 1024; // 512 KB

function generateId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 10);
}

export async function POST(req: Request) {
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

  const id = generateId();
  await db.insert(sharedCanvases).values({ id, data: JSON.stringify(body) });
  return NextResponse.json({ id });
}
