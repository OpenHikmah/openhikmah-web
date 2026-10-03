import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/admin-auth";
import { getTranslationProgress, getVerificationProgress } from "@/lib/ai/verification-progress";

/** Live progress of the two re-verification backlogs: English connections
 *  (verses, cells and connections) and translated rows (overall and per locale),
 *  each done / remaining / percent. Read-only; the job logs carry the same
 *  numbers while a run is going. */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const [connections, translations] = await Promise.all([
      getVerificationProgress(),
      getTranslationProgress(),
    ]);
    return NextResponse.json({ connections, translations });
  } catch (err) {
    console.error("admin verification GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
