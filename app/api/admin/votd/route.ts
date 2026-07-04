import { NextRequest, NextResponse } from "next/server";
import { and, gte, lt, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/admin-auth";
import { logAdminAction } from "@/lib/admin-audit";
import { db } from "@/lib/db";
import { curatedVotd } from "@/lib/db/schema";
import { isValidRef } from "@/lib/quran-corpus";
import { resolveVerse } from "@/lib/verse-resolver";

const MONTH_RE = /^\d{4}-\d{2}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** A YYYY-MM-DD that is also a real calendar date (rejects e.g. 2026-02-31,
 *  which would otherwise blow up at the Postgres `date` layer with a 500). */
function isRealDay(s: string): boolean {
  if (!DAY_RE.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** First day of the month after `YYYY-MM`, as `YYYY-MM-DD` — the exclusive upper
 *  bound for a month range (avoids hardcoding a -31 that's invalid for most months). */
function nextMonthFirst(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m, 1)); // m is 1-based ⇒ this is the next month
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

/** List curated overrides for a month: `?month=YYYY-MM` (defaults to current). */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const month = req.nextUrl.searchParams.get("month") ?? new Date().toISOString().slice(0, 7);
  const monthNum = Number(month.slice(5, 7));
  if (!MONTH_RE.test(month) || monthNum < 1 || monthNum > 12) {
    return NextResponse.json({ error: "Invalid month (expected YYYY-MM, 01–12)" }, { status: 400 });
  }

  const rows = await db
    .select()
    .from(curatedVotd)
    .where(and(gte(curatedVotd.date, `${month}-01`), lt(curatedVotd.date, nextMonthFirst(month))));

  return NextResponse.json({
    month,
    entries: rows.map((r) => ({
      date: r.date,
      verseRef: r.verseRef,
      reflection: r.reflection,
      updatedAt: r.updatedAt,
    })),
  });
}

/** Set (upsert) the curated verse + reflection for a given UTC day. */
export async function PUT(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  let body: { date?: string; verseRef?: string; reflection?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { date, verseRef } = body;
  // Guard the runtime type — a client could send a non-string reflection.
  const reflection = typeof body.reflection === "string" ? body.reflection.trim() || null : null;

  if (!date || !isRealDay(date)) {
    return NextResponse.json(
      { error: "Invalid date (expected a real YYYY-MM-DD)" },
      { status: 400 }
    );
  }
  if (!verseRef || !isValidRef(verseRef)) {
    return NextResponse.json({ error: "Invalid verse reference" }, { status: 400 });
  }
  // Reject refs that resolve nowhere — catches valid-looking but out-of-range ayahs.
  const verse = await resolveVerse(verseRef);
  if (!verse) {
    return NextResponse.json({ error: "That verse could not be resolved" }, { status: 400 });
  }

  await db
    .insert(curatedVotd)
    .values({ date, verseRef, reflection, updatedBy: auth.user.qfId })
    .onConflictDoUpdate({
      target: curatedVotd.date,
      set: { verseRef, reflection, updatedBy: auth.user.qfId, updatedAt: new Date() },
    });

  await logAdminAction({
    adminQfId: auth.user.qfId,
    action: "votd.set",
    targetType: "date",
    targetId: date,
    meta: { verseRef, hasReflection: reflection !== null },
  });

  return NextResponse.json({ date, verseRef, reflection });
}

/** Clear the curated override for a day: `?date=YYYY-MM-DD`. Falls back to the
 *  algorithmic pick afterwards. */
export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const date = req.nextUrl.searchParams.get("date");
  if (!date || !isRealDay(date)) {
    return NextResponse.json(
      { error: "Invalid date (expected a real YYYY-MM-DD)" },
      { status: 400 }
    );
  }

  await db.delete(curatedVotd).where(eq(curatedVotd.date, date));
  await logAdminAction({
    adminQfId: auth.user.qfId,
    action: "votd.clear",
    targetType: "date",
    targetId: date,
  });

  return new NextResponse(null, { status: 204 });
}
