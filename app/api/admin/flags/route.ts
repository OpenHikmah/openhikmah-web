import { NextRequest, NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { requireAdmin, rateLimitAdminMutation } from "@/lib/admin/admin-auth";
import { logAdminAction } from "@/lib/admin/admin-audit";
import { db } from "@/lib/infra/db";
import { featureFlags } from "@/lib/infra/db/schema";
import { invalidateFlagCache, validateFlagType } from "@/lib/admin/feature-flags";
import { resolveProvider, resolveModel, type AiFeature } from "@/lib/ai/ai";
import { safeParse } from "@/lib/infra/http";

async function resolveRoute(feature: AiFeature | undefined) {
  const provider = await resolveProvider(feature);
  return { provider, model: await resolveModel(feature, provider) };
}

const KEY_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/i;

/** All feature flags, alphabetical. Values are JSON (parsed for the client).
 *  `resolvedAi` is the provider+model each AI route actually resolves to right
 *  now (flags + env, per `resolveProvider`/`resolveModel`) — the flags UI needs
 *  it to offer a valid model list, since it can't read server-side env itself. */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const rows = await db.select().from(featureFlags).orderBy(asc(featureFlags.key));
    const [defaultRoute, connections, names] = await Promise.all([
      resolveRoute(undefined),
      resolveRoute("connections"),
      resolveRoute("names"),
    ]);
    return NextResponse.json({
      flags: rows.map((r) => ({
        key: r.key,
        value: safeParse(r.value),
        updatedBy: r.updatedBy,
        updatedAt: r.updatedAt,
      })),
      resolvedAi: { default: defaultRoute, connections, names },
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

  const value = JSON.stringify(body.value);
  // Feature-flag values are small config (a provider name, a model id, a number,
  // a short list). Anything in the kilobytes is a mistake or an attempt to use
  // the table as a blob store — reject before it hits the DB. Measured in UTF-8
  // bytes: `.length` is UTF-16 code units, so a multibyte value could slip past.
  if (new TextEncoder().encode(value).byteLength > 8192) {
    return NextResponse.json({ error: "Flag value too large (max 8KB)" }, { status: 400 });
  }

  try {
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
