import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/infra/db";
import { verses, connections, connectionCoverage } from "@/lib/infra/db/schema";
import { SURAH_LENGTHS } from "@/lib/quran/audio";
import { SURAH_NAMES } from "@/lib/quran/surah-names";
import { LOCALES, type Locale } from "@/lib/i18n/config";
import type { EdgeKind } from "@/types/quran";

/**
 * Read model for the /admin/coverage page: how much of the connection graph
 * is filled, per (kind × locale). A cell is "covered" if it has >=1 active
 * connection — always computed live from `connections`, never from the
 * denormalised `connection_coverage.active_count` (which can lag).
 */

const KINDS: readonly EdgeKind[] = ["thematic", "root", "contrast"];
const TOTAL_VERSES = SURAH_LENGTHS.reduce((a, b) => a + b, 0); // 6236

export interface CoverageCell {
  kind: EdgeKind;
  locale: Locale;
  covered: number;
  missing: number;
  exhausted: number;
}

export interface SurahCoverageRow {
  surah: number;
  name: string;
  ayahCount: number;
  /** covered verse count for the chosen locale, per kind */
  thematic: number;
  root: number;
  contrast: number;
}

export interface CoverageReport {
  totalVerses: number;
  /** 3 kinds × 4 locales */
  matrix: CoverageCell[];
  /** rollup for `focusLocale` */
  focusLocale: Locale;
  surahs: SurahCoverageRow[];
  /** sample of missing refs for `focusKind` × `focusLocale` */
  focusKind: EdgeKind;
  missingSample: string[];
  missingSampleTotal: number;
}

function isKind(value: string | null): value is EdgeKind {
  return value === "thematic" || value === "root" || value === "contrast";
}
function isLocale(value: string | null): value is Locale {
  return (LOCALES as readonly string[]).includes(value ?? "");
}

export async function getCoverageReport(params?: {
  locale?: string | null;
  kind?: string | null;
}): Promise<CoverageReport> {
  const focusLocale: Locale = isLocale(params?.locale ?? null) ? (params!.locale as Locale) : "en";
  const focusKind: EdgeKind = isKind(params?.kind ?? null)
    ? (params!.kind as EdgeKind)
    : "thematic";

  // Covered distinct from_ref count per (kind, locale).
  const coveredRows = await db
    .select({
      kind: connections.kind,
      locale: connections.locale,
      covered: sql<number>`count(distinct ${connections.fromRef})::int`,
    })
    .from(connections)
    .where(eq(connections.status, "active"))
    .groupBy(connections.kind, connections.locale);
  const coveredByCell = new Map<string, number>();
  for (const r of coveredRows) coveredByCell.set(`${r.kind}:${r.locale}`, r.covered);

  // Exhausted cell count per (kind, locale).
  const exhaustedRows = await db
    .select({
      kind: connectionCoverage.kind,
      locale: connectionCoverage.locale,
      n: sql<number>`count(*)::int`,
    })
    .from(connectionCoverage)
    .where(sql`${connectionCoverage.exhaustedAt} is not null`)
    .groupBy(connectionCoverage.kind, connectionCoverage.locale);
  const exhaustedByCell = new Map<string, number>();
  for (const r of exhaustedRows) exhaustedByCell.set(`${r.kind}:${r.locale}`, r.n);

  const matrix: CoverageCell[] = [];
  for (const kind of KINDS) {
    for (const locale of LOCALES) {
      const covered = coveredByCell.get(`${kind}:${locale}`) ?? 0;
      matrix.push({
        kind,
        locale,
        covered,
        missing: TOTAL_VERSES - covered,
        exhausted: exhaustedByCell.get(`${kind}:${locale}`) ?? 0,
      });
    }
  }

  // Per-surah rollup for the focus locale: covered verses per kind.
  const surahRows = await db
    .select({
      surah: sql<number>`split_part(${connections.fromRef}, ':', 1)::int`,
      kind: connections.kind,
      covered: sql<number>`count(distinct ${connections.fromRef})::int`,
    })
    .from(connections)
    .where(and(eq(connections.status, "active"), eq(connections.locale, focusLocale)))
    .groupBy(sql`split_part(${connections.fromRef}, ':', 1)::int`, connections.kind);
  const surahCovered = new Map<string, number>();
  for (const r of surahRows) surahCovered.set(`${r.surah}:${r.kind}`, r.covered);

  const surahs: SurahCoverageRow[] = SURAH_LENGTHS.map((ayahCount, i) => {
    const surah = i + 1;
    return {
      surah,
      name: SURAH_NAMES[surah]?.[0] ?? `Surah ${surah}`,
      ayahCount,
      thematic: surahCovered.get(`${surah}:thematic`) ?? 0,
      root: surahCovered.get(`${surah}:root`) ?? 0,
      contrast: surahCovered.get(`${surah}:contrast`) ?? 0,
    };
  });

  // Sample of verse refs missing a connection for focus kind × locale.
  const missingRows = await db
    .select({ ref: verses.ref })
    .from(verses)
    .where(
      sql`not exists (
        select 1 from ${connections} c
        where c.from_ref = ${verses.ref}
          and c.kind = ${focusKind}
          and c.status = 'active'
          and c.locale = ${focusLocale}
      )`
    )
    .orderBy(verses.surah, verses.ayah)
    .limit(100);
  const focusCovered = coveredByCell.get(`${focusKind}:${focusLocale}`) ?? 0;

  return {
    totalVerses: TOTAL_VERSES,
    matrix,
    focusLocale,
    surahs,
    focusKind,
    missingSample: missingRows.map((r) => r.ref),
    missingSampleTotal: TOTAL_VERSES - focusCovered,
  };
}
