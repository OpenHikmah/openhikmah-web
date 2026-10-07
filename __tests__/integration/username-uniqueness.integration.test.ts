import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { NextRequest } from "next/server";

// Real Postgres: uniqueness is enforced by an index, and migration 0029 resolves
// pre-existing collisions, so neither is meaningfully testable with mocks.

const { authedUser } = vi.hoisted(() => ({ authedUser: { current: null as unknown } }));
vi.mock("@/lib/auth/social-auth", () => ({
  requireUser: vi.fn(async () => authedUser.current),
  invalidateTokenCache: vi.fn(),
}));

import { db } from "@/lib/infra/db";
import { users } from "@/lib/infra/db/schema";
import { isUniqueViolation } from "@/lib/infra/http";
import { PATCH } from "@/app/api/social/me/route";

const MIGRATION = readFileSync(
  join(process.cwd(), "lib/infra/db/migrations/0029_username_case_insensitive_unique.sql"),
  "utf8"
);
const ROLLBACK = MIGRATION.split("\n")[0]
  .replace(/^-- Rollback: /, "")
  .replace(/ \(usernames.*$/, "");

async function runMigration() {
  for (const stmt of MIGRATION.split("--> statement-breakpoint")) {
    const body = stmt
      .split("\n")
      .filter((l) => !l.startsWith("--"))
      .join("\n")
      .trim();
    if (body) await db.execute(sql.raw(body));
  }
}

beforeEach(async () => {
  await db.execute(sql`TRUNCATE users RESTART IDENTITY CASCADE`);
});

afterAll(async () => {
  // Leave the shared schema in its migrated state for later files.
  await db.execute(sql`DROP INDEX IF EXISTS "users_username_lower_idx"`);
  await db.execute(sql`TRUNCATE users RESTART IDENTITY CASCADE`);
  await runMigration();
});

describe("case-insensitive username uniqueness (real Postgres)", () => {
  it("rejects 'alice' once 'Alice' exists (and the reverse), but allows distinct names", async () => {
    await db.insert(users).values({ qfId: "qf-1", username: "Alice" });

    const err = await db
      .insert(users)
      .values({ qfId: "qf-2", username: "alice" })
      .then(() => null)
      .catch((e: unknown) => e);
    expect(isUniqueViolation(err)).toBe(true);

    await db.insert(users).values({ qfId: "qf-3", username: "bob" });
    const reverse = await db
      .insert(users)
      .values({ qfId: "qf-4", username: "BOB" })
      .then(() => null)
      .catch((e: unknown) => e);
    expect(isUniqueViolation(reverse)).toBe(true);
  });

  it("PATCH /api/social/me answers 409 for a name that differs only by case", async () => {
    const [alice] = await db.insert(users).values({ qfId: "qf-a", username: "Alice" }).returning();
    const [bob] = await db.insert(users).values({ qfId: "qf-b", username: "bobby" }).returning();
    authedUser.current = { userId: bob.id, user: bob };

    const res = await PATCH(
      new NextRequest("http://localhost/api/social/me", {
        method: "PATCH",
        headers: { Authorization: "Bearer t", "Content-Type": "application/json" },
        body: JSON.stringify({ username: "aLiCe" }),
      })
    );
    expect(res.status).toBe(409);

    // Changing only the case of your own name is not a collision with yourself.
    authedUser.current = { userId: alice.id, user: alice };
    const own = await PATCH(
      new NextRequest("http://localhost/api/social/me", {
        method: "PATCH",
        headers: { Authorization: "Bearer t", "Content-Type": "application/json" },
        body: JSON.stringify({ username: "alice" }),
      })
    );
    expect(own.status).toBe(200);
  });

  it("migration 0029 renames newer colliding accounts (oldest keeps the name) and builds the index", async () => {
    await db.execute(sql`DROP INDEX "users_username_lower_idx"`);
    await db.insert(users).values([
      { qfId: "q1", username: "Sara" },
      { qfId: "q2", username: "sara" },
      { qfId: "q3", username: "SARA" },
      { qfId: "q4", username: "unique_one" },
      { qfId: "q5", username: "abcdefghijklmnopqrst" },
      { qfId: "q6", username: "ABCDEFGHIJKLMNOPQRST" },
    ]);

    await runMigration();

    const rows = await db.execute<{ id: number; username: string }>(
      sql`SELECT id, username FROM users ORDER BY id`
    );
    const names = rows.map((r) => r.username);
    expect(names[0]).toBe("Sara");
    expect(names[1]).toBe("sara_2");
    expect(names[2]).toBe("SARA_3");
    expect(names[3]).toBe("unique_one");
    expect(names[4]).toBe("abcdefghijklmnopqrst");
    expect(names[5]).toBe("ABCDEFGHIJKLMNOPQR_6");
    expect(names[5].length).toBeLessThanOrEqual(20);
    expect(new Set(names.map((n) => n.toLowerCase())).size).toBe(names.length);

    const idx = await db.execute<{ indexname: string }>(
      sql`SELECT indexname FROM pg_indexes WHERE tablename = 'users' AND indexname IN ('users_username_lower_idx','users_username_idx')`
    );
    expect(idx.map((i) => i.indexname)).toEqual(["users_username_lower_idx"]);
    const cons = await db.execute(
      sql`SELECT 1 FROM pg_constraint WHERE conname = 'users_username_unique'`
    );
    expect(cons).toHaveLength(0);
  });

  it("migration 0029 is idempotent and its rollback restores case-sensitive uniqueness", async () => {
    await runMigration();
    await runMigration();

    for (const stmt of ROLLBACK.split(/;\s*/).filter(Boolean)) await db.execute(sql.raw(stmt));

    await db.insert(users).values([
      { qfId: "r1", username: "Alice" },
      { qfId: "r2", username: "alice" },
    ]);
    const dup = await db
      .insert(users)
      .values({ qfId: "r3", username: "alice" })
      .then(() => null)
      .catch((e: unknown) => e);
    expect(isUniqueViolation(dup)).toBe(true);
  });
});
