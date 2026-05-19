import { NextRequest, NextResponse } from "next/server";

const QF_API_BASE = process.env.QF_API_BASE ?? "";
const QF_CLIENT_ID = process.env.NEXT_PUBLIC_QF_CLIENT_ID ?? "";

function extractToken(req: NextRequest): string | null {
  const auth = req.headers.get("authorization");
  return auth?.startsWith("Bearer ") ? auth.slice(7) : null;
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ ref: string }> }
) {
  if (!QF_API_BASE || !QF_CLIENT_ID) {
    return NextResponse.json(
      { error: "QF_API_BASE or NEXT_PUBLIC_QF_CLIENT_ID is not configured" },
      { status: 503 }
    );
  }

  const token = extractToken(req);
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { ref } = await params;
  const decodedRef = decodeURIComponent(ref);

  try {
    const res = await fetch(
      `${QF_API_BASE}/auth/v1/bookmarks/${encodeURIComponent(decodedRef)}`,
      {
        method: "DELETE",
        headers: {
          "x-auth-token": token,
          "x-client-id": QF_CLIENT_ID,
        },
      }
    );

    if (!res.ok) {
      return NextResponse.json({ error: "Failed to remove bookmark" }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Bookmark DELETE error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
