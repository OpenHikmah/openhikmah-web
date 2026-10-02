import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/infra/db";
import { rateLimits } from "@/lib/infra/db/schema";
import { sweepRateLimits } from "@/lib/infra/rate-limit";

const SHORT_WINDOW = 60;
const TZ_WINDOW = 20 * 60 * 60;

const ago = (seconds: number) => new Date(Date.now() - seconds * 1000);

async function seed(key: string, createdAt: Date) {
  await db.insert(rateLimits).values({ key, count: 1, createdAt });
}

async function keys() {
  const rows = await db.select({ key: rateLimits.key }).from(rateLimits);
  return rows.map((r) => r.key).sort();
}

beforeEach(async () => {
  await db.delete(rateLimits);
});

describe("sweepRateLimits (integration, real Postgres)", () => {
  it("a short-window sweep deletes its own expired buckets but keeps the 20h tz-anchor bucket", async () => {
    // Retention is 10 windows: 600s for the 60s window, 200h for the 20h window.
    await seed(`ip:1:w${SHORT_WINDOW}:1`, ago(3600));
    await seed(`ip:2:w${SHORT_WINDOW}:2`, ago(30));
    // Far older than the short window's retention, well inside the 20h window's.
    await seed(`tz:1:w${TZ_WINDOW}:3`, ago(5 * 60 * 60));

    await sweepRateLimits(SHORT_WINDOW);

    expect(await keys()).toEqual([`ip:2:w${SHORT_WINDOW}:2`, `tz:1:w${TZ_WINDOW}:3`]);
  });

  it("matches the trailing window suffix only, not a lookalike segment inside the caller's key", async () => {
    await seed(`user:w${SHORT_WINDOW}:x:w${TZ_WINDOW}:4`, ago(3600));

    await sweepRateLimits(SHORT_WINDOW);

    expect(await keys()).toEqual([`user:w${SHORT_WINDOW}:x:w${TZ_WINDOW}:4`]);
  });

  it("prunes legacy keys with no window segment only after a day", async () => {
    await seed("legacy:old:7", ago(2 * 24 * 60 * 60));
    await seed("legacy:recent:8", ago(60 * 60));

    await sweepRateLimits(SHORT_WINDOW);

    expect(await keys()).toEqual(["legacy:recent:8"]);
  });

  it("a 20h-window sweep deletes the 20h bucket once it is past its own retention", async () => {
    await seed(`tz:old:w${TZ_WINDOW}:5`, ago(201 * 60 * 60));
    await seed(`tz:new:w${TZ_WINDOW}:6`, ago(5 * 60 * 60));

    await sweepRateLimits(TZ_WINDOW);

    expect(await keys()).toEqual([`tz:new:w${TZ_WINDOW}:6`]);
  });
});
