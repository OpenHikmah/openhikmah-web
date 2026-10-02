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

export interface TranslationProgress {
  /** Active translated (non-English) connection rows. */
  rows: Progress;
  /** The same, per locale (tr, ru, az). */
  byLocale: Record<string, Progress>;
}

interface LocaleRow extends Record<string, unknown> {
  locale: string;
  total: number;
  done: number;
}

/**
 * How many of the active translated connections have passed the back-translation
 * meaning check (`translation_checked_at` set: at creation, or by the
 * translation re-verification job). Flagged rows drop out, as for connections.
 */
export async function getTranslationProgress(): Promise<TranslationProgress> {
  const rows = await db.execute<LocaleRow>(sql`
    SELECT locale,
           count(*)::int AS total,
           (count(*) FILTER (WHERE translation_checked_at IS NOT NULL))::int AS done
    FROM connections
    WHERE locale <> 'en' AND status = 'active'
    GROUP BY locale
    ORDER BY locale
  `);
  const byLocale: Record<string, Progress> = {};
  let total = 0;
  let done = 0;
  for (const r of rows) {
    byLocale[r.locale] = toProgress(r.total, r.done);
    total += r.total;
    done += r.done;
  }
  return { rows: toProgress(total, done), byLocale };
}

/** One log line, e.g. "412/1,800 translations (22.9%) | tr 150/600 ru 140/600 az 122/600 | 1,388 remaining". */
export function formatTranslationProgress(p: TranslationProgress): string {
  const locales = Object.entries(p.byLocale)
    .map(([l, v]) => `${l} ${fmt(v.done)}/${fmt(v.total)}`)
    .join(" ");
  return (
    `${fmt(p.rows.done)}/${fmt(p.rows.total)} translations (${p.rows.percent}%)` +
    (locales ? ` | ${locales}` : "") +
    ` | ${fmt(p.rows.remaining)} remaining`
  );
}
