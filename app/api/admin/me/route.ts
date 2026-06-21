import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";

/** Identity check used by the admin UI gate. 200 + identity for an admin, else
 *  the guard's own 401/404 — the client treats anything non-200 as "not admin". */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json({ qfId: auth.user.qfId, username: auth.user.username });
}
