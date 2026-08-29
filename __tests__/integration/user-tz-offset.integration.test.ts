import { describe, it, expect, beforeEach } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/infra/db";
import { users } from "@/lib/infra/db/schema";

async function reset() {
  await db.execute(sql`TRUNCATE users RESTART IDENTITY CASCADE`);
}

beforeEach(reset);

describe("users.timezone_offset_minutes (integration, real Postgres)", () => {
  it("migration 0023 added the column as a nullable integer", async () => {
    const rows = await db.execute(sql`
      SELECT data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'users' AND column_name = 'timezone_offset_minutes'
    `);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ data_type: "integer", is_nullable: "YES" });
  });

  it("defaults to null and round-trips a stored offset", async () => {
    const [created] = await db
      .insert(users)
      .values({ qfId: "qf-tz-1", username: "tzuser" })
      .returning();
    expect(created.timezoneOffsetMinutes).toBeNull();

    await db.update(users).set({ timezoneOffsetMinutes: 180 }).where(eq(users.id, created.id));

    const [updated] = await db.select().from(users).where(eq(users.id, created.id));
    expect(updated.timezoneOffsetMinutes).toBe(180);
  });
});
