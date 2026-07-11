import { NextRequest, NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { requireAdmin, rateLimitAdminMutation } from "@/lib/admin/admin-auth";
import { logAdminAction } from "@/lib/admin/admin-audit";
import { db } from "@/lib/infra/db";
import { featureFlags } from "@/lib/infra/db/schema";
import { invalidateFlagCache, validateFlagType } from "@/lib/admin/feature-flags";

const KEY_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/i;

/** All feature flags, alphabetical. Values are JSON (parsed for the client). */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const rows = await db.select().from(featureFlags).orderBy(asc(featureFlags.key));
    return NextResponse.json({
      flags: rows.map((r) => ({
        key: r.key,
        value: safeParse(r.value),
        updatedBy: r.updatedBy,
        updatedAt: r.updatedAt,
      })),
    });
  } catch (err) {
    console.error("admin flags GET db error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** Upsert a flag: body `{ key, value }` where value is any JSON-serialisable. */
export async function PUT(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const limited = await rateLimitAdminMutation(auth);
  if (limited) return limited;

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
  const typeErr = validateFlagType(key, body.value);
  if (typeErr) {
    return NextResponse.json({ error: typeErr }, { status: 400 });
  }

  try {
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
    invalidateFlagCache(key);

    return NextResponse.json({ key, value: body.value });
  } catch (err) {
    console.error("admin flags PUT db error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** Delete a flag: `?key=...` (subsystem then falls back to its code default). */
export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const limited = await rateLimitAdminMutation(auth);
  if (limited) return limited;

  const key = req.nextUrl.searchParams.get("key");
  if (!key || !KEY_RE.test(key)) {
    return NextResponse.json({ error: "Invalid flag key" }, { status: 400 });
  }

  try {
    await db.delete(featureFlags).where(eq(featureFlags.key, key));
    await logAdminAction({
      adminQfId: auth.user.qfId,
      action: "flag.delete",
      targetType: "flag",
      targetId: key,
    });
    invalidateFlagCache(key);

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error("admin flags DELETE db error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}
