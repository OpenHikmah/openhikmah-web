import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/admin-auth";
import { getCoverageReport } from "@/lib/admin/coverage-report";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const locale = searchParams.get("locale");
  const kind = searchParams.get("kind");
  if (kind && !["thematic", "root", "contrast"].includes(kind)) {
    return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
  }
  if (locale && !["en", "tr", "ru", "az"].includes(locale)) {
    return NextResponse.json({ error: "Invalid locale" }, { status: 400 });
  }

  try {
    const report = await getCoverageReport({ locale, kind });
    return NextResponse.json(report);
  } catch (err) {
    console.error("admin coverage GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
