import { describe, it, expect, beforeEach } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/lib/infra/db";
import { getHiddenSlugs, getAllFlags, flagStory, unflagStory } from "@/lib/stories/story-flags";

async function reset() {
  await db.execute(sql`TRUNCATE story_flags`);
}

beforeEach(reset);

describe("story_flags (integration, real Postgres)", () => {
  it("flagStory then getHiddenSlugs round-trips the flagged slug", async () => {
    await flagStory("yusuf", "wrong translation nuance", "qf-admin");
    const hidden = await getHiddenSlugs();
    expect(hidden.has("yusuf")).toBe(true);
    expect(hidden.size).toBe(1);
  });

  it("getAllFlags returns the reason and admin who flagged it", async () => {
    await flagStory("musa", "needs theological review", "qf-admin");
    const flags = await getAllFlags();
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({
      slug: "musa",
      reason: "needs theological review",
      flaggedBy: "qf-admin",
    });
    expect(flags[0].flaggedAt).toBeInstanceOf(Date);
  });

  it("re-flagging the same slug updates the reason instead of erroring", async () => {
    await flagStory("adam", "first reason", "qf-admin");
    await flagStory("adam", "updated reason", "qf-admin");
    const flags = await getAllFlags();
    expect(flags).toHaveLength(1);
    expect(flags[0].reason).toBe("updated reason");
  });

  it("unflagStory removes the slug from the hidden set", async () => {
    await flagStory("nuh", null, "qf-admin");
    expect((await getHiddenSlugs()).has("nuh")).toBe(true);

    await unflagStory("nuh");
    expect((await getHiddenSlugs()).has("nuh")).toBe(false);
    expect(await getAllFlags()).toHaveLength(0);
  });

  it("unflagging a slug that was never flagged is a harmless no-op", async () => {
    await expect(unflagStory("never-flagged")).resolves.not.toThrow();
  });
});
