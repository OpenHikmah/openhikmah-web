import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/admin-auth";
import { getVerificationProgress } from "@/lib/ai/verification-progress";

/** Live progress of the connection re-verification backlog (verses, cells and
 *  connections done / remaining / percent). Read-only; the job log carries the
 *  same numbers while a run is going. */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    return NextResponse.json({ connections: await getVerificationProgress() });
  } catch (err) {
    console.error("admin verification GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
