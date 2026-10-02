import { describe, it, expect } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/lib/infra/db";

async function indexNames(table: string): Promise<string[]> {
  const rows = await db.execute<{ indexname: string }>(
    sql`SELECT indexname FROM pg_indexes WHERE schemaname = current_schema() AND tablename = ${table}`
  );
  return rows.map((r) => r.indexname);
}

describe("schema indexes (integration, real Postgres)", () => {
  it("note_mentions indexes both foreign-key columns alongside the unread lookup", async () => {
    expect(await indexNames("note_mentions")).toEqual(
      expect.arrayContaining([
        "note_mentions_mentioned_user_read_idx",
        "note_mentions_note_id_idx",
        "note_mentions_mentioning_user_id_idx",
      ])
    );
  });

  it("rate_limits keeps its created_at index for the sweep", async () => {
    expect(await indexNames("rate_limits")).toContain("rate_limits_created_idx");
  });
});
