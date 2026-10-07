import { describe, it, expect, beforeEach, vi } from "vitest";
import { sql, eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Real Postgres: these are check-then-act races, so they only mean something
// against a real database with real concurrent transactions.

const { authed } = vi.hoisted(() => ({ authed: new Map<string, unknown>() }));
vi.mock("@/lib/auth/social-auth", () => ({
  requireUser: vi.fn(async (req: Request) => authed.get(req.headers.get("authorization") ?? "")),
  invalidateTokenCache: vi.fn(),
}));
vi.mock("@/lib/infra/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/infra/rate-limit")>()),
  rateLimitOrNull: vi.fn(async () => null),
}));
vi.mock("@/lib/admin/admin-auth", () => ({
  requireAdmin: vi.fn(async () => ({ userId: 1, user: { qfId: "qf-admin" } })),
  rateLimitAdminMutation: vi.fn(async () => null),
}));
vi.mock("@/lib/admin/admin-audit", () => ({ logAdminAction: vi.fn(async () => undefined) }));

import { db } from "@/lib/infra/db";
import {
  challenges,
  connectionCoverage,
  connections,
  friendships,
  users,
} from "@/lib/infra/db/schema";
import { isUniqueViolation } from "@/lib/infra/http";
import { POST as postFriend } from "@/app/api/social/friends/route";
import { POST as postChallenge } from "@/app/api/social/challenges/route";
import { PATCH as patchConnection } from "@/app/api/admin/connections/route";

const ROUNDS = 8;

beforeEach(async () => {
  await db.execute(
    sql`TRUNCATE users, friendships, challenges, connections, connection_coverage RESTART IDENTITY CASCADE`
  );
  authed.clear();
});

async function twoUsers() {
  const [a, b] = await db
    .insert(users)
    .values([
      { qfId: "qf-a", username: "alice" },
      { qfId: "qf-b", username: "bobby" },
    ])
    .returning();
  authed.set("a", { userId: a.id, user: a });
  authed.set("b", { userId: b.id, user: b });
  return { a, b };
}

function post(url: string, token: string, body: unknown) {
  return new NextRequest(`http://localhost${url}`, {
    method: "POST",
    headers: { authorization: token, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("friend requests (real Postgres)", () => {
  it("the unique index is on the UNORDERED pair: A→B then B→A cannot both insert", async () => {
    const { a, b } = await twoUsers();
    await db.insert(friendships).values({ requesterId: a.id, addresseeId: b.id });
    const err = await db
      .insert(friendships)
      .values({ requesterId: b.id, addresseeId: a.id })
      .then(() => null)
      .catch((e: unknown) => e);
    expect(isUniqueViolation(err)).toBe(true);
  });

  it("concurrent opposite-direction requests leave exactly one row and never 500", async () => {
    for (let i = 0; i < ROUNDS; i++) {
      await db.execute(sql`TRUNCATE users, friendships RESTART IDENTITY CASCADE`);
      await twoUsers();
      const [r1, r2] = await Promise.all([
        postFriend(post("/api/social/friends", "a", { username: "bobby" })),
        postFriend(post("/api/social/friends", "b", { username: "alice" })),
      ]);
      expect([r1.status, r2.status].every((s) => [200, 201, 409].includes(s))).toBe(true);
      const rows = await db.select().from(friendships);
      expect(rows).toHaveLength(1);
    }
  });

  it("migration 0030 collapses existing duplicate pairs (accepted wins, then pending, then oldest) and is idempotent", async () => {
    const { a, b } = await twoUsers();
    const [c] = await db.insert(users).values({ qfId: "qf-c", username: "carol" }).returning();
    await db.execute(sql`DROP INDEX "friendships_unordered_pair_idx"`);
    await db.insert(friendships).values([
      { requesterId: a.id, addresseeId: b.id, status: "pending" },
      { requesterId: b.id, addresseeId: a.id, status: "accepted" },
      { requesterId: a.id, addresseeId: c.id, status: "pending" },
      { requesterId: c.id, addresseeId: a.id, status: "declined" },
    ]);

    const migration = readFileSync(
      join(process.cwd(), "lib/infra/db/migrations/0030_friendships_unordered_pair.sql"),
      "utf8"
    );
    const run = async () => {
      for (const stmt of migration.split("--> statement-breakpoint")) {
        const body = stmt
          .split("\n")
          .filter((l) => !l.startsWith("--"))
          .join("\n")
          .trim();
        if (body) await db.execute(sql.raw(body));
      }
    };
    await run();
    await run();

    const rows = await db.select().from(friendships).orderBy(friendships.id);
    expect(rows.map((r) => [r.requesterId, r.addresseeId, r.status])).toEqual([
      [b.id, a.id, "accepted"],
      [a.id, c.id, "pending"],
    ]);
    const idx = await db.execute(
      sql`SELECT 1 FROM pg_indexes WHERE indexname = 'friendships_unordered_pair_idx'`
    );
    expect(idx).toHaveLength(1);
  });

  it("mutual requests end up accepted when the second sees the first", async () => {
    await twoUsers();
    const first = await postFriend(post("/api/social/friends", "a", { username: "bobby" }));
    expect(first.status).toBe(201);
    const second = await postFriend(post("/api/social/friends", "b", { username: "alice" }));
    expect(second.status).toBe(200);
    expect((await db.select().from(friendships))[0].status).toBe("accepted");
  });
});

describe("challenge creation (real Postgres)", () => {
  it("concurrent creates between a pair (either direction) produce exactly one live challenge", async () => {
    for (let i = 0; i < ROUNDS; i++) {
      await db.execute(sql`TRUNCATE users, friendships, challenges RESTART IDENTITY CASCADE`);
      const { a, b } = await twoUsers();
      await db
        .insert(friendships)
        .values({ requesterId: a.id, addresseeId: b.id, status: "accepted" });
      const results = await Promise.all([
        postChallenge(
          post("/api/social/challenges", "a", { challengedUsername: "bobby", duration: "24h" })
        ),
        postChallenge(
          post("/api/social/challenges", "b", { challengedUsername: "alice", duration: "24h" })
        ),
        postChallenge(
          post("/api/social/challenges", "a", { challengedUsername: "bobby", duration: "48h" })
        ),
      ]);
      const statuses = results.map((r) => r.status).sort();
      expect(statuses).toEqual([201, 409, 409]);
      expect(await db.select().from(challenges)).toHaveLength(1);
    }
  });
});

describe("connection coverage counter (real Postgres)", () => {
  it("concurrent retires of the same active connection decrement the counter once", async () => {
    for (let i = 0; i < ROUNDS; i++) {
      await db.execute(sql`TRUNCATE connections, connection_coverage RESTART IDENTITY CASCADE`);
      const [conn] = await db
        .insert(connections)
        .values({
          fromRef: "1:1",
          toRef: "2:255",
          kind: "thematic",
          reason: "A well-formed reason for this fixture.",
          locale: "en",
        })
        .returning();
      await db
        .insert(connectionCoverage)
        .values({ fromRef: "1:1", kind: "thematic", locale: "en", activeCount: 5 });

      const patch = (status: string) =>
        patchConnection(
          new NextRequest("http://localhost/api/admin/connections", {
            method: "PATCH",
            headers: { authorization: "t", "content-type": "application/json" },
            body: JSON.stringify({ id: conn.id, status }),
          })
        );
      const res = await Promise.all([patch("retired"), patch("retired"), patch("flagged")]);
      expect(res.map((r) => r.status)).toEqual([200, 200, 200]);

      const [cell] = await db
        .select()
        .from(connectionCoverage)
        .where(eq(connectionCoverage.fromRef, "1:1"));
      expect(cell.activeCount).toBe(4);
    }
  });
});
