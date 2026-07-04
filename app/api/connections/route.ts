import { NextRequest, NextResponse } from "next/server";
import { getConnections } from "@/lib/graph-service";
import { isValidRef } from "@/lib/quran-corpus";
import { RateLimitError } from "@/lib/rate-limit";
import { clientKey } from "@/lib/http";
import type { EdgeKind } from "@/types/quran";

export async function POST(req: NextRequest) {
  let body: { fromRef?: string; kind?: string; arabicText?: string; translation?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { fromRef, kind, arabicText, translation } = body;

  if (!fromRef || !kind || !arabicText || !translation) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  if (!["thematic", "root", "contrast"].includes(kind)) {
    return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
  }

  if (!isValidRef(fromRef)) {
    return NextResponse.json({ error: "Invalid fromRef" }, { status: 400 });
  }

  try {
    const results = await getConnections(
      fromRef,
      kind as EdgeKind,
      { arabicText, translation },
      { clientKey: clientKey(req) }
    );

    if (results.length === 0) {
      return NextResponse.json({ error: "Could not resolve any verses" }, { status: 500 });
    }

    return NextResponse.json(results);
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json({ error: "Too many requests — please slow down." }, { status: 429 });
    }
    console.error("Connections route error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
