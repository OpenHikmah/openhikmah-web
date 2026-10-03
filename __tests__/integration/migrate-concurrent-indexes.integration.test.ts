import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import { sql } from "drizzle-orm";
import { db } from "@/lib/infra/db";

// Runs the real script against the Testcontainers Postgres (issue #672): a
// failed CREATE INDEX CONCURRENTLY leaves an INVALID new index, and the next
// run must rebuild it instead of trusting IF NOT EXISTS and dropping the old,
// still-valid index.

const run = promisify(execFile);
const SCRIPT = join(process.cwd(), "scripts/migrate-concurrent-indexes.mjs");

async function runScript(): Promise<{ ok: boolean; output: string }> {
  try {
    const { stdout, stderr } = await run(process.execPath, [SCRIPT], { env: process.env });
    return { ok: true, output: stdout + stderr };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string };
    return { ok: false, output: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

async function indexState(name: string): Promise<"valid" | "invalid" | "absent"> {
  const rows = await db.execute<{ indisvalid: boolean }>(sql`
    SELECT i.indisvalid FROM pg_index i
    JOIN pg_class c ON c.oid = i.indexrelid
    WHERE c.relname = ${name}
  `);
  if (rows.length === 0) return "absent";
  return rows[0].indisvalid ? "valid" : "invalid";
}

// Simulates the leftover of a failed CONCURRENTLY build without racing one.
async function markNewIndexInvalid() {
  await db.execute(sql`
    UPDATE pg_index SET indisvalid = false
    WHERE indexrelid = 'connections_from_to_kind_locale_idx'::regclass
  `);
}

beforeEach(async () => {
  // The unique (from_ref, to_ref, kind) index below fails on rows an earlier test file left behind.
  await db.execute(sql`TRUNCATE connections RESTART IDENTITY CASCADE`);
});

afterEach(async () => {
  // Restore the final schema global-setup.ts established for other test files.
  await db.execute(sql`TRUNCATE connections RESTART IDENTITY CASCADE`);
  await db.execute(sql`DROP INDEX IF EXISTS connections_from_to_kind_locale_idx`);
  await db.execute(sql`DROP INDEX IF EXISTS connections_from_to_kind_idx`);
  await db.execute(sql`
    CREATE UNIQUE INDEX connections_from_to_kind_locale_idx
    ON connections (from_ref, to_ref, kind, locale)
  `);
});

describe("scripts/migrate-concurrent-indexes.mjs", () => {
  it("rebuilds an INVALID new index before dropping the old one", async () => {
    await db.execute(sql`
      CREATE UNIQUE INDEX connections_from_to_kind_idx ON connections (from_ref, to_ref, kind)
    `);
    await markNewIndexInvalid();

    const { ok, output } = await runScript();

    expect(ok, output).toBe(true);
    expect(output).toContain("INVALID");
    expect(await indexState("connections_from_to_kind_locale_idx")).toBe("valid");
    expect(await indexState("connections_from_to_kind_idx")).toBe("absent");
  });

  it("keeps the old index when the rebuild fails", async () => {
    // Non-unique stand-in for the old index so duplicate rows can exist and make
    // the unique rebuild fail; the script only looks it up by name.
    await db.execute(sql`
      CREATE INDEX connections_from_to_kind_idx ON connections (from_ref, to_ref, kind)
    `);
    await db.execute(sql`DROP INDEX connections_from_to_kind_locale_idx`);
    await db.execute(sql`
      INSERT INTO connections (from_ref, to_ref, kind, reason, locale) VALUES
        ('2:255', '1:1', 'thematic', 'first', 'en'),
        ('2:255', '1:1', 'thematic', 'duplicate', 'en')
    `);
    // A real failed concurrent build: it errors on the duplicates and leaves
    // the INVALID index behind, exactly the state the script must handle.
    await expect(
      db.execute(sql`
        CREATE UNIQUE INDEX CONCURRENTLY connections_from_to_kind_locale_idx
        ON connections (from_ref, to_ref, kind, locale)
      `)
    ).rejects.toThrow();
    expect(await indexState("connections_from_to_kind_locale_idx")).toBe("invalid");

    const { ok } = await runScript();

    expect(ok).toBe(false);
    expect(await indexState("connections_from_to_kind_idx")).toBe("valid");
    expect(await indexState("connections_from_to_kind_locale_idx")).not.toBe("valid");
  });
});
