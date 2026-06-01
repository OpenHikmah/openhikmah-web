import { NextRequest, NextResponse } from "next/server";
import { getConnections } from "@/lib/graph-service";
import { isValidRef } from "@/lib/quran-corpus";
import { RateLimitError } from "@/lib/rate-limit";
import type { EdgeKind } from "@/types/quran";

// IPv4/IPv6 characters only, capped at IPv6's max length. Guards against
// arbitrarily long / malformed x-forwarded-for values being persisted as
// rate-limit keys.
const IP_PATTERN = /^[0-9a-fA-F:.]{1,45}$/;

function clientKey(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  const candidate =
    fwd?.split(",")[0]?.trim() || req.headers.get("x-real-ip")?.trim() || "";
  // Fall back to a single shared "unknown" bucket rather than omitting the key:
  // the AI path must always be rate-limited, even when no usable IP is present.
  return IP_PATTERN.test(candidate) ? candidate : "unknown";
}

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
      return NextResponse.json(
        { error: "Too many requests — please slow down." },
        { status: 429 }
      );
    }
    console.error("Connections route error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
