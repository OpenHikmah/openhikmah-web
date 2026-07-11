"use client";

import { AdminPageHeader } from "@/components/admin/AdminShell";
import { StatTile, Table, Th, Td, StateNote } from "@/components/admin/primitives";
import { useAdminFetch } from "@/components/admin/AdminContext";
import { useAsync } from "@/components/admin/useAsync";

interface AnalyticsResponse {
  topVerses: { fromRef: string; count: number }[];
  connectionsByKind: { kind: string; count: number }[];
  dau: number;
  search: {
    lookbackDays: number;
    popular: { query: string; count: number }[];
    zeroResult: { query: string; count: number }[];
  };
}

export default function AnalyticsPage() {
  const api = useAdminFetch();
  const { data, error, loading } = useAsync<AnalyticsResponse>(
    () => api("/analytics"),
    "analytics"
  );

  return (
    <>
      <AdminPageHeader
        title="Analytics"
        subtitle="Product usage: what people explore, search, and where search comes up empty."
      />
      <div className="space-y-6 p-7">
        {error && <StateNote tone="error">{error}</StateNote>}
        {loading && <StateNote>Loading…</StateNote>}

        {data && (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile label="DAU" value={data.dau} hint="Active in the last 24h" />
              {data.connectionsByKind.map((k) => (
                <StatTile
                  key={k.kind}
                  label={`${k.kind} connections`}
                  value={k.count}
                  tone="teal"
                />
              ))}
            </div>

            <Section title="Top verses explored" subtitle="By generated-connection volume">
              {data.topVerses.length === 0 ? (
                <StateNote>No connections generated yet.</StateNote>
              ) : (
                <Table>
                  <thead>
                    <tr>
                      <Th>Verse</Th>
                      <Th className="text-right">Connections</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topVerses.map((v) => (
                      <tr key={v.fromRef}>
                        <Td className="font-mono text-xs text-text-secondary">{v.fromRef}</Td>
                        <Td className="text-right tabular-nums">{v.count}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Section>

            <Section title="Popular searches" subtitle={`Last ${data.search.lookbackDays} days`}>
              {data.search.popular.length === 0 ? (
                <StateNote>No searches logged yet.</StateNote>
              ) : (
                <Table>
                  <thead>
                    <tr>
                      <Th>Query</Th>
                      <Th className="text-right">Count</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.search.popular.map((s) => (
                      <tr key={s.query}>
                        <Td className="text-xs text-text-secondary">{s.query}</Td>
                        <Td className="text-right tabular-nums">{s.count}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Section>

            <Section title="Zero-result searches" subtitle="Feeds directly into content & curation">
              {data.search.zeroResult.length === 0 ? (
                <StateNote>No zero-result searches in this window.</StateNote>
              ) : (
                <Table>
                  <thead>
                    <tr>
                      <Th>Query</Th>
                      <Th className="text-right">Count</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.search.zeroResult.map((s) => (
                      <tr key={s.query}>
                        <Td className="text-xs text-text-secondary">{s.query}</Td>
                        <Td className="text-right tabular-nums">{s.count}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Section>
          </>
        )}
      </div>
    </>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div>
        <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
        {subtitle && <p className="text-xs text-text-muted">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}
