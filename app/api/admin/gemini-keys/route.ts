import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/admin-auth";
import { configuredGeminiKeys } from "@/lib/admin/job-runner";

/** Which of the `GEMINI_API1..5` env vars are set — NAMES only, never values.
 *  The coverage page's backfill form uses this to build the "loop mode" key
 *  picker (a client can't read env). Admin-gated; key names are not secret. */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json({ keys: configuredGeminiKeys() });
}
