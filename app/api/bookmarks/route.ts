import { NextRequest, NextResponse } from "next/server";

const QF_API_BASE = process.env.QF_API_BASE ?? "";
const QF_CLIENT_ID = process.env.NEXT_PUBLIC_QF_CLIENT_ID ?? "";

function extractToken(req: NextRequest): string | null {
  const auth = req.headers.get("authorization");
  return auth?.startsWith("Bearer ") ? auth.slice(7) : null;
}

function qfHeaders(token: string) {
  return {
    "x-auth-token": token,
    "x-client-id": QF_CLIENT_ID,
    "Content-Type": "application/json",
  };
}

export async function GET(req: NextRequest) {
  const token = extractToken(req);
  if (!token) return NextResponse.json({ refs: [] });

  try {
    const res = await fetch(`${QF_API_BASE}/auth/v1/bookmarks?first=100`, {
      headers: qfHeaders(token),
    });

    if (!res.ok) return NextResponse.json({ refs: [] });

    const data = await res.json();
    // Normalize across possible response shapes
    const items: Array<Record<string, unknown>> =
      data?.bookmarks ?? data?.data ?? [];

    const refs = items
      .map((b) => (b.verse_key ?? b.key ?? b.ref) as string)
      .filter(Boolean);

    return NextResponse.json({ refs });
  } catch (err) {
    console.error("Bookmarks GET error:", err);
    return NextResponse.json({ refs: [] });
  }
}

export async function POST(req: NextRequest) {
  const token = extractToken(req);
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { ref?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (!body.ref || !/^\d+:\d+$/.test(body.ref)) {
    return NextResponse.json({ error: "Invalid verse ref" }, { status: 400 });
  }

  const [surahStr, ayahStr] = body.ref.split(":");

  try {
    const res = await fetch(`${QF_API_BASE}/auth/v1/bookmarks`, {
      method: "POST",
      headers: qfHeaders(token),
      body: JSON.stringify({
        verse_key: body.ref,
        chapter_number: parseInt(surahStr, 10),
        verse_number: parseInt(ayahStr, 10),
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("Bookmark POST failed:", text);
      return NextResponse.json({ error: "Failed to bookmark" }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Bookmark POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
