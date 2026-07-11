import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { requireAdmin, rateLimitAdminMutation } from "@/lib/admin/admin-auth";
import { logAdminAction } from "@/lib/admin/admin-audit";
import { db } from "@/lib/infra/db";
import { promptVersions } from "@/lib/infra/db/schema";
import { invalidatePromptCache, type PromptKey } from "@/lib/ai/prompt-registry";

/**
 * Roll back to a prior prompt version: `{ id }`. Reactivates that row and
 * deactivates whatever else was active for the same key — a rollback is just
 * "make an old version active again", not a data change to the row itself.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const limited = await rateLimitAdminMutation(auth);
  if (limited) return limited;

  let body: { id?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!Number.isInteger(body.id)) {
    return NextResponse.json({ error: "Invalid version id" }, { status: 400 });
  }
  const id = body.id as number;

  try {
    const activated = await db.transaction(async (tx) => {
      const [target] = await tx.select().from(promptVersions).where(eq(promptVersions.id, id));
      if (!target) return null;

      await tx
        .update(promptVersions)
        .set({ active: false })
        .where(and(eq(promptVersions.key, target.key), eq(promptVersions.active, true)));

      const [row] = await tx
        .update(promptVersions)
        .set({ active: true })
        .where(eq(promptVersions.id, id))
        .returning();
      return row;
    });

    if (!activated) {
      return NextResponse.json({ error: "Prompt version not found" }, { status: 404 });
    }

    invalidatePromptCache(activated.key as PromptKey);

    await logAdminAction({
      adminQfId: auth.user.qfId,
      action: "prompt.version.rollback",
      targetType: "prompt_version",
      targetId: String(id),
      meta: { key: activated.key },
    });

    return NextResponse.json({ version: activated });
  } catch (err) {
    console.error("admin prompts rollback POST db error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
