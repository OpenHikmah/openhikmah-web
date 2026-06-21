import { NextRequest, NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/admin-auth";
import { logAdminAction } from "@/lib/admin-audit";
import { db } from "@/lib/db";
import { featureFlags } from "@/lib/db/schema";

const KEY_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/i;

/** All feature flags, alphabetical. Values are JSON (parsed for the client). */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const rows = await db.select().from(featureFlags).orderBy(asc(featureFlags.key));
  return NextResponse.json({
    flags: rows.map((r) => ({
      key: r.key,
      value: safeParse(r.value),
      updatedBy: r.updatedBy,
      updatedAt: r.updatedAt,
    })),
  });
}

/** Upsert a flag: body `{ key, value }` where value is any JSON-serialisable. */
export async function PUT(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  let body: { key?: string; value?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const key = body.key?.trim();
  if (!key || !KEY_RE.test(key)) {
    return NextResponse.json({ error: "Invalid flag key" }, { status: 400 });
  }
  if (body.value === undefined) {
    return NextResponse.json({ error: "Missing value" }, { status: 400 });
  }

  const value = JSON.stringify(body.value);
  await db
    .insert(featureFlags)
    .values({ key, value, updatedBy: auth.user.qfId })
    .onConflictDoUpdate({
      target: featureFlags.key,
      set: { value, updatedBy: auth.user.qfId, updatedAt: new Date() },
    });

  await logAdminAction({
    adminQfId: auth.user.qfId,
    action: "flag.set",
    targetType: "flag",
    targetId: key,
    meta: { value: body.value },
  });

  return NextResponse.json({ key, value: body.value });
}

/** Delete a flag: `?key=...` (subsystem then falls back to its code default). */
export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const key = req.nextUrl.searchParams.get("key");
  if (!key || !KEY_RE.test(key)) {
    return NextResponse.json({ error: "Invalid flag key" }, { status: 400 });
  }

  await db.delete(featureFlags).where(eq(featureFlags.key, key));
  await logAdminAction({
    adminQfId: auth.user.qfId,
    action: "flag.delete",
    targetType: "flag",
    targetId: key,
  });

  return new NextResponse(null, { status: 204 });
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}
