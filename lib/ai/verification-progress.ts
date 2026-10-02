import { sql } from "drizzle-orm";
import { db } from "@/lib/infra/db";

/** One measure of the re-verification backlog. */
export interface Progress {
  total: number;
  done: number;
  remaining: number;
  /** 0-100, one decimal. An empty backlog counts as complete. */
  percent: number;
}

export interface VerificationProgress {
  /** Verses whose every active English cell has been verified. */
  verses: Progress;
  /** (verse, kind) cells: the unit the verifier is called on. */
  cells: Progress;
  /** Active English connections. */
  connections: Progress;
}

export function toProgress(total: number, done: number): Progress {
  return {
    total,
    done,
    remaining: Math.max(total - done, 0),
    percent: total === 0 ? 100 : Math.round((done / total) * 1000) / 10,
  };
}

interface Row extends Record<string, unknown> {
  cells_total: number;
  cells_verified: number;
  conns_total: number;
  conns_verified: number;
  verses_total: number;
  verses_verified: number;
}

/**
 * How much of the active English connection set has been through the verifier
 * (a cell is verified once its coverage row has `verified_at`). Flagged and
 * retired connections are no longer active, so they drop out of the totals as
 * the job flags them: the percentage is of what is still being served.
 */
export async function getVerificationProgress(): Promise<VerificationProgress> {
  const rows = await db.execute<Row>(sql`
    WITH cells AS (
      SELECT c.from_ref, c.kind, count(*)::int AS n, (cc.verified_at IS NOT NULL) AS verified
      FROM connections c
      LEFT JOIN connection_coverage cc
        ON cc.from_ref = c.from_ref AND cc.kind = c.kind AND cc.locale = 'en'
      WHERE c.locale = 'en' AND c.status = 'active'
      GROUP BY c.from_ref, c.kind, cc.verified_at
    )
    SELECT
      count(*)::int AS cells_total,
      (count(*) FILTER (WHERE verified))::int AS cells_verified,
      coalesce(sum(n), 0)::int AS conns_total,
      coalesce(sum(n) FILTER (WHERE verified), 0)::int AS conns_verified,
      count(DISTINCT from_ref)::int AS verses_total,
      (count(DISTINCT from_ref) FILTER (
        WHERE from_ref NOT IN (SELECT from_ref FROM cells WHERE NOT verified)
      ))::int AS verses_verified
    FROM cells
  `);
  const r = rows[0];
  return {
    verses: toProgress(r.verses_total, r.verses_verified),
    cells: toProgress(r.cells_total, r.cells_verified),
    connections: toProgress(r.conns_total, r.conns_verified),
  };
}

const fmt = (n: number) => n.toLocaleString("en-US");

/** One log line, e.g. "1,204/6,236 verses (19.3%) | 3,812/18,708 connections (20.4%) | 14,896 connections remaining". */
export function formatProgress(p: VerificationProgress): string {
  return (
    `${fmt(p.verses.done)}/${fmt(p.verses.total)} verses (${p.verses.percent}%) | ` +
    `${fmt(p.connections.done)}/${fmt(p.connections.total)} connections (${p.connections.percent}%) | ` +
    `${fmt(p.connections.remaining)} connections remaining`
  );
}
