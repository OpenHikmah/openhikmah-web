"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Table,
  Th,
  Td,
  Pill,
  StatTile,
  StateNote,
  ConfirmButton,
} from "@/components/admin/primitives";
import { useAdminFetch, AdminApiError } from "@/components/admin/AdminContext";
import { useAsync } from "@/components/admin/useAsync";
import { SkeletonRows } from "@/components/admin/Skeleton";
import type { CoverageReport as CoverageResponse, CoverageCell } from "@/lib/admin/coverage-report";
import type { Locale } from "@/lib/i18n/config";
import type { EdgeKind } from "@/types/quran";
import { SELECTABLE_MODELS } from "@/lib/ai/models";

type Kind = EdgeKind;

const KINDS: Kind[] = ["thematic", "root", "contrast"];
const LOCALES: Locale[] = ["en", "tr", "ru", "az"];
const TARGET_LOCALES: Exclude<Locale, "en">[] = ["tr", "ru", "az"];

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

  const [mode, setMode] = useState<"baseline" | "topup">("baseline");
  const [provider, setProvider] = useState<"claude" | "gemini">("gemini");
  const [model, setModel] = useState("");
  const [runLocales, setRunLocales] = useState<Record<string, boolean>>({
    tr: true,
    ru: true,
    az: true,
  });
  const [maxCalls, setMaxCalls] = useState(200);
  const [maxCostUsd, setMaxCostUsd] = useState(5);
  const [runNote, setRunNote] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const startRun = async () => {
    setRunNote(null);
    setRunError(null);
    setStarting(true);
    try {
      await api("/jobs", {
        method: "POST",
        json: {
          jobId: "backfill-connections",
          params: {
            mode,
            provider,
            ...(model ? { model } : {}),
            locales: TARGET_LOCALES.filter((l) => runLocales[l]).join(","),
            maxCalls,
            maxCostUsd,
          },
        },
      });
      setRunNote("Started. Watch progress on the Jobs page.");
      reload();
    } catch (e) {
      setRunError(e instanceof AdminApiError ? e.message : "Failed to start the backfill job.");
    } finally {
      setStarting(false);
    }
  };

  const totalMissingEn = data
    ? KINDS.reduce((sum, k) => sum + (cell(data.matrix, k, "en")?.missing ?? 0), 0)
    : 0;
  const totalExhausted = data ? data.matrix.reduce((sum, c) => sum + c.exhausted, 0) : 0;

  return (
    <div className="space-y-8">
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
            <h3 className="mb-2 text-sm font-semibold text-text-primary">
              Verses missing a connection (kind × language)
            </h3>
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
            <h3 className="mb-2 text-sm font-semibold text-text-primary">Missing verses</h3>
            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
              <select
                value={focusKind}
                onChange={(e) => setFocusKind(e.target.value as Kind)}
                className="rounded border border-border bg-surface px-2 py-1"
              >
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
              <select
                value={focusLocale}
                onChange={(e) => setFocusLocale(e.target.value as Locale)}
                className="rounded border border-border bg-surface px-2 py-1"
              >
                {LOCALES.map((l) => (
                  <option key={l} value={l}>
                    {l.toUpperCase()}
                  </option>
                ))}
              </select>
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
            <h3 className="mb-2 text-sm font-semibold text-text-primary">
              Per-surah coverage ({focusLocale.toUpperCase()}) — verses with a connection, per kind
            </h3>
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

          <section className="rounded-lg border border-border bg-surface p-4">
            <h3 className="text-sm font-semibold text-text-primary">Run the backfill job</h3>
            <p className="mt-1 text-xs text-text-muted">
              Generates connections for verses that have none (baseline) or tops up the thinnest
              cells (top-up). Resumable — already-generated connections are never regenerated, and a
              cell with no more real connections is marked exhausted so it is never re-run.
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-xs">
                <span className="mb-1 block text-text-muted">Mode</span>
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value as "baseline" | "topup")}
                  className="w-full rounded border border-border bg-bg px-2 py-1.5"
                >
                  <option value="baseline">baseline — fill cells with zero connections</option>
                  <option value="topup">top-up — add more to the thinnest cells</option>
                </select>
              </label>

              <label className="text-xs">
                <span className="mb-1 block text-text-muted">Provider</span>
                <select
                  value={provider}
                  onChange={(e) => {
                    setProvider(e.target.value as "claude" | "gemini");
                    setModel("");
                  }}
                  className="w-full rounded border border-border bg-bg px-2 py-1.5"
                >
                  <option value="gemini">gemini — cheapest</option>
                  <option value="claude">claude — highest fidelity</option>
                </select>
              </label>

              <label className="text-xs">
                <span className="mb-1 block text-text-muted">Model</span>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full rounded border border-border bg-bg px-2 py-1.5"
                >
                  <option value="">default</option>
                  {SELECTABLE_MODELS[provider].map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>

              <div className="text-xs">
                <span className="mb-1 block text-text-muted">Also translate reasons into</span>
                <div className="flex gap-3">
                  {TARGET_LOCALES.map((l) => (
                    <label key={l} className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={runLocales[l] ?? false}
                        onChange={(e) => setRunLocales((s) => ({ ...s, [l]: e.target.checked }))}
                      />
                      {l.toUpperCase()}
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <label>
                  <span className="mb-1 block text-text-muted">Max LLM calls</span>
                  <input
                    type="number"
                    min={1}
                    value={maxCalls}
                    onChange={(e) => setMaxCalls(Number(e.target.value))}
                    className="w-full rounded border border-border bg-bg px-2 py-1.5 tabular-nums"
                  />
                </label>
                <label>
                  <span className="mb-1 block text-text-muted">Max cost (USD, est.)</span>
                  <input
                    type="number"
                    min={0.1}
                    step={0.1}
                    value={maxCostUsd}
                    onChange={(e) => setMaxCostUsd(Number(e.target.value))}
                    className="w-full rounded border border-border bg-bg px-2 py-1.5 tabular-nums"
                  />
                </label>
              </div>
            </div>

            <p className="mt-2 text-[11px] text-text-muted">
              The job stops cleanly at whichever limit is hit first. Max calls is exact; max cost is
              a per-call estimate (token counts aren&apos;t tracked on this path).
            </p>

            {runError && <StateNote tone="error">{runError}</StateNote>}
            {runNote && (
              <p className="mt-2 text-xs text-teal">
                {runNote}{" "}
                <Link href="/admin/jobs" className="underline">
                  Open Jobs
                </Link>
              </p>
            )}

            <div className="mt-3">
              <ConfirmButton
                variant="secondary"
                disabled={starting}
                onConfirm={startRun}
                confirmLabel={`Run ${mode} on ${provider}?`}
              >
                {starting ? "Starting…" : "Run backfill"}
              </ConfirmButton>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
