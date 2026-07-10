import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/admin/admin-auth";
import { logAdminAction } from "@/lib/admin/admin-audit";
import { db } from "@/lib/infra/db";
import { promptVersions } from "@/lib/infra/db/schema";
import { PROMPT_KEYS, invalidatePromptCache, type PromptKey } from "@/lib/ai/prompt-registry";

/** All prompt versions, newest first, optionally filtered by `?key=`. */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const key = req.nextUrl.searchParams.get("key");
  if (key && !(PROMPT_KEYS as readonly string[]).includes(key)) {
    return NextResponse.json({ error: "Invalid prompt key" }, { status: 400 });
  }

  const rows = await db
    .select()
    .from(promptVersions)
    .where(key ? eq(promptVersions.key, key) : undefined)
    .orderBy(desc(promptVersions.createdAt));

  return NextResponse.json({ keys: PROMPT_KEYS, versions: rows });
}

/**
 * Create a new prompt version for `key` and make it the active one, deactivating
 * whatever was previously active for that key. Body: `{ key, template }`.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  let body: { key?: string; template?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const key = body.key as PromptKey | undefined;
  if (!key || !(PROMPT_KEYS as readonly string[]).includes(key)) {
    return NextResponse.json({ error: "Invalid prompt key" }, { status: 400 });
  }
  const template = body.template?.trim();
  if (!template) {
    return NextResponse.json({ error: "Missing template" }, { status: 400 });
  }

  const created = await db.transaction(async (tx) => {
    await tx
      .update(promptVersions)
      .set({ active: false })
      .where(and(eq(promptVersions.key, key), eq(promptVersions.active, true)));

    const [row] = await tx
      .insert(promptVersions)
      .values({ key, template, createdBy: auth.user.qfId, active: true })
      .returning();
    return row;
  });

  invalidatePromptCache(key);

  await logAdminAction({
    adminQfId: auth.user.qfId,
    action: "prompt.version.create",
    targetType: "prompt_version",
    targetId: String(created.id),
    meta: { key },
  });

  return NextResponse.json({ version: created });
}
