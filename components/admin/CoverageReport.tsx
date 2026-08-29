"use client";

import { useState } from "react";
import { NativeSelect } from "@/components/ui";
import { Table, Th, Td, Pill, StatTile, StateNote } from "@/components/admin/primitives";
import { SectionHeading } from "@/components/admin/SectionHeading";
import { useAdminFetch } from "@/components/admin/AdminContext";
import { useAsync } from "@/components/admin/useAsync";
import { SkeletonRows } from "@/components/admin/Skeleton";
import { BackfillRunner } from "@/components/admin/BackfillRunner";
import type { CoverageReport as CoverageResponse, CoverageCell } from "@/lib/admin/coverage-report";
import type { Locale } from "@/lib/i18n/config";
import type { EdgeKind } from "@/types/quran";

type Kind = EdgeKind;

const KINDS: Kind[] = ["thematic", "root", "contrast"];
const LOCALES: Locale[] = ["en", "tr", "ru", "az"];

const cell = (m: CoverageCell[], kind: Kind, locale: Locale) =>
  m.find((c) => c.kind === kind && c.locale === locale);

export function CoverageReport() {
  const api = useAdminFetch();
  const [focusKind, setFocusKind] = useState<Kind>("thematic");
  const [focusLocale, setFocusLocale] = useState<Locale>("en");

  const { data, error, loading, reload } = useAsync<CoverageResponse>(
    () => api(`/coverage?kind=${focusKind}&locale=${focusLocale}`),
    `admin-coverage-${focusKind}-${focusLocale}`
  );

  const totalMissingEn = data
    ? KINDS.reduce((sum, k) => sum + (cell(data.matrix, k, "en")?.missing ?? 0), 0)
    : 0;
  const totalExhausted = data ? data.matrix.reduce((sum, c) => sum + c.exhausted, 0) : 0;

  return (
    <div className="space-y-6">
      {error && <StateNote tone="error">{error}</StateNote>}
      {loading && !data && <SkeletonRows n={8} />}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatTile
              label="English cells missing"
              value={totalMissingEn.toLocaleString()}
              hint={`of ${(data.totalVerses * 3).toLocaleString()} (verses × 3 kinds)`}
              tone={totalMissingEn === 0 ? "teal" : "gold"}
            />
            <StatTile
              label="Cells marked exhausted"
              value={totalExhausted.toLocaleString()}
              hint="no more connections to find — skipped by top-up"
              tone="plain"
            />
            <StatTile
              label="Verses in corpus"
              value={data.totalVerses.toLocaleString()}
              tone="plain"
            />
          </div>

          <section>
            <SectionHeading title="Verses missing a connection (kind × language)" />
            <Table>
              <thead>
                <tr>
                  <Th>Kind</Th>
                  {LOCALES.map((l) => (
                    <Th key={l} className="text-right">
                      {l.toUpperCase()}
                    </Th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {KINDS.map((k) => (
                  <tr key={k}>
                    <Td className="text-text-secondary">{k}</Td>
                    {LOCALES.map((l) => {
                      const c = cell(data.matrix, k, l);
                      const missing = c?.missing ?? 0;
                      const covered = c?.covered ?? 0;
                      return (
                        <Td key={l} className="text-right tabular-nums">
                          {missing === 0 ? (
                            <Pill tone="active">complete</Pill>
                          ) : (
                            <>
                              <span className={l === "en" ? "text-gold" : "text-text-primary"}>
                                {missing.toLocaleString()}
                                {c && c.exhausted > 0 && (
                                  <span className="ml-1 text-[10px] text-text-muted">
                                    ({c.exhausted} exh)
                                  </span>
                                )}
                              </span>
                              <span className="block text-[10px] text-text-muted">
                                {covered.toLocaleString()} / {data.totalVerses.toLocaleString()}{" "}
                                done
                              </span>
                            </>
                          )}
                        </Td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </Table>
            <p className="mt-1.5 text-xs text-text-muted">
              These are <em>missing</em>-verse counts. A verse can&apos;t get a translated
              connection until its English one exists, and the translation pass lags English
              generation — so non-English missing counts are always ≥ English. Fill English first;
              the translation locales close the gap afterward. (Exhausted-cell tracking is
              English-only.)
            </p>
          </section>

          <section>
            <SectionHeading title="Missing verses" />
            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
              <NativeSelect
                aria-label="Connection kind"
                value={focusKind}
                onChange={(e) => setFocusKind(e.target.value as Kind)}
                className="h-8 w-36 py-1 text-xs"
              >
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </NativeSelect>
              <NativeSelect
                aria-label="Language"
                value={focusLocale}
                onChange={(e) => setFocusLocale(e.target.value as Locale)}
                className="h-8 w-28 py-1 text-xs"
              >
                {LOCALES.map((l) => (
                  <option key={l} value={l}>
                    {l.toUpperCase()}
                  </option>
                ))}
              </NativeSelect>
              <span className="text-text-muted">
                {data.missingSampleTotal.toLocaleString()} total missing — showing first{" "}
                {data.missingSample.length}
              </span>
            </div>
            {data.missingSample.length === 0 ? (
              <StateNote>No missing verses for this kind + language.</StateNote>
            ) : (
              <p className="max-h-40 overflow-y-auto rounded border border-border bg-surface p-2 font-mono text-[11px] text-text-secondary">
                {data.missingSample.join("  ")}
              </p>
            )}
          </section>

          <section>
            <SectionHeading
              title={`Per-surah coverage (${focusLocale.toUpperCase()}) — verses with a connection, per kind`}
            />
            <div className="max-h-96 overflow-y-auto">
              <Table>
                <thead>
                  <tr>
                    <Th>Surah</Th>
                    <Th className="text-right">Ayahs</Th>
                    <Th className="text-right">Thematic</Th>
                    <Th className="text-right">Root</Th>
                    <Th className="text-right">Contrast</Th>
                    <Th className="text-right">Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.surahs.map((s) => {
                    const full =
                      s.thematic >= s.ayahCount &&
                      s.root >= s.ayahCount &&
                      s.contrast >= s.ayahCount;
                    return (
                      <tr key={s.surah}>
                        <Td className="whitespace-nowrap text-text-secondary">
                          {s.surah}. {s.name}
                        </Td>
                        <Td className="text-right tabular-nums text-text-muted">{s.ayahCount}</Td>
                        <Td className="text-right tabular-nums">{s.thematic}</Td>
                        <Td className="text-right tabular-nums">{s.root}</Td>
                        <Td className="text-right tabular-nums">{s.contrast}</Td>
                        <Td className="text-right">
                          {full ? (
                            <Pill tone="active">full</Pill>
                          ) : (
                            <Pill tone="neutral">partial</Pill>
                          )}
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </div>
          </section>
        </>
      )}

      <BackfillRunner onStarted={() => reload({ keepDataOnError: true })} />
    </div>
  );
}
