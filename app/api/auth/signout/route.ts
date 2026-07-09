import { NextRequest, NextResponse } from "next/server";
import { invalidateTokenCache } from "@/lib/auth/social-auth";

export async function POST(req: NextRequest) {
  // Drop the server-side token cache for this access token. This clears THIS
  // instance's in-process L1 + the shared Redis L2 — fully effective on the
  // current single-container deployment. NOTE: with multiple app instances, a
  // peer's in-process L1 would still honor the token until its ~5-min TTL; a
  // cross-instance revocation tombstone is deferred until horizontal scale-out.
  // Best-effort: the client sends its Bearer token; if absent we still clear the
  // refresh cookie below.
  const auth = req.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  if (token) invalidateTokenCache(token);

  const response = NextResponse.json({ ok: true });
  response.cookies.delete("qf_refresh_token");
  return response;
}
