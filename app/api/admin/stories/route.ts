import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, rateLimitAdminMutation } from "@/lib/admin/admin-auth";
import { logAdminAction } from "@/lib/admin/admin-audit";
import { STORIES, getStoryBySlug } from "@/lib/stories";
import { getAllFlags, flagStory, unflagStory } from "@/lib/stories/story-flags";

/** List every story (static catalog) merged with its flag row, if any. */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const flags = await getAllFlags();
    const flagsBySlug = new Map(flags.map((f) => [f.slug, f]));

    const stories = STORIES.map((s) => {
      const flag = flagsBySlug.get(s.slug);
      return {
        slug: s.slug,
        name: s.name.en,
        arabicName: s.arabicName,
        chapters: s.chapters.length,
        hidden: flag !== undefined,
        reason: flag?.reason ?? null,
        flaggedBy: flag?.flaggedBy ?? null,
        flaggedAt: flag?.flaggedAt ?? null,
      };
    });

    return NextResponse.json({ stories });
  } catch (err) {
    console.error("admin stories GET db error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * Flag a story hidden (`{ slug, hidden: true, reason? }`) or restore it
 * (`{ slug, hidden: false }`). Flagging takes effect immediately on the next
 * request to /stories — see `getVisibleStoryBySlug`/`listVisibleStories`.
 */
export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const limited = await rateLimitAdminMutation(auth);
  if (limited) return limited;

  let body: { slug?: string; hidden?: boolean; reason?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { slug, hidden } = body;
  // Guard the runtime type — a client could send a non-string reason.
  const reason = typeof body.reason === "string" ? body.reason.trim() || null : null;
  if (typeof slug !== "string" || !slug) {
    return NextResponse.json({ error: "Invalid slug" }, { status: 400 });
  }
  if (typeof hidden !== "boolean") {
    return NextResponse.json({ error: "Must specify hidden" }, { status: 400 });
  }
  if (!getStoryBySlug(slug)) {
    return NextResponse.json({ error: "Unknown story slug" }, { status: 400 });
  }

  try {
    if (hidden) {
      await flagStory(slug, reason, auth.user.qfId);
      await logAdminAction({
        adminQfId: auth.user.qfId,
        action: "story.flag",
        targetType: "story",
        targetId: slug,
        meta: { reason },
      });
    } else {
      await unflagStory(slug);
      await logAdminAction({
        adminQfId: auth.user.qfId,
        action: "story.unflag",
        targetType: "story",
        targetId: slug,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("admin stories PATCH db error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
