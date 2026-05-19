import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, BookOpen } from "lucide-react";
import { getNameBySlug, DIVINE_NAMES, CATEGORY_LABELS, type NameCategory } from "@/lib/divine-names";
import { NameVerses } from "./NameVerses";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const name = getNameBySlug(slug);
  if (!name) return {};
  return {
    title: `${name.transliteration} — Open Hikmah`,
    description: name.description,
  };
}

const CATEGORY_STYLES: Record<NameCategory, { accent: string; badge: string }> = {
  dhat: {
    accent: "var(--color-gold)",
    badge: "bg-[color-mix(in_srgb,var(--color-gold)_15%,transparent)] text-[var(--color-gold)] border border-[color-mix(in_srgb,var(--color-gold)_30%,transparent)]",
  },
  sifat: {
    accent: "var(--color-teal)",
    badge: "bg-[color-mix(in_srgb,var(--color-teal)_15%,transparent)] text-[var(--color-teal)] border border-[color-mix(in_srgb,var(--color-teal)_30%,transparent)]",
  },
  "af'al": {
    accent: "#7c6af7",
    badge: "bg-[color-mix(in_srgb,#7c6af7_15%,transparent)] text-[#a89cf7] border border-[color-mix(in_srgb,#7c6af7_30%,transparent)]",
  },
};

export default async function NameDetailPage({ params }: Props) {
  const { slug } = await params;
  const name = getNameBySlug(slug);
  if (!name) notFound();

  const styles = CATEGORY_STYLES[name.category];
  const categoryLabel = CATEGORY_LABELS[name.category];

  const prevName = DIVINE_NAMES.find((n) => n.id === name.id - 1);
  const nextName = DIVINE_NAMES.find((n) => n.id === name.id + 1);

  return (
    <div
      className="min-h-screen"
      style={{ background: "var(--color-bg)", color: "var(--color-text-primary)" }}
    >
      {/* Header */}
      <header
        className="sticky top-0 z-20 flex items-center justify-between px-6 h-12"
        style={{
          background: "var(--color-surface)",
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        <div className="flex items-center gap-3">
          <BookOpen className="w-4 h-4" style={{ color: "var(--color-gold)" }} />
          <span className="text-sm font-medium">Open Hikmah</span>
        </div>
        <Link
          href="/names"
          className="flex items-center gap-1.5 text-xs transition-colors hover:opacity-80"
          style={{ color: "var(--color-text-secondary)" }}
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>All Names</span>
        </Link>
      </header>

      {/* Name hero */}
      <div
        className="max-w-3xl mx-auto px-6 pt-14 pb-12 text-center"
        style={{ borderBottom: "1px solid var(--color-border-subtle)" }}
      >
        <div
          className="inline-block text-xs font-mono mb-6 px-2 py-1 rounded"
          style={{
            background: "var(--color-surface-raised)",
            color: "var(--color-text-muted)",
            border: "1px solid var(--color-border)",
          }}
        >
          #{name.id} of 99
        </div>

        <h1
          className="font-arabic text-7xl mb-3"
          style={{ color: styles.accent }}
        >
          {name.arabic}
        </h1>

        <p
          className="text-xl font-mono mb-2"
          style={{ color: "var(--color-text-primary)" }}
        >
          {name.transliteration}
        </p>

        <p
          className="text-lg mb-6"
          style={{ color: "var(--color-text-secondary)" }}
        >
          {name.meaning}
        </p>

        <div className="flex items-center justify-center gap-3 flex-wrap mb-6">
          <span className={`text-xs px-2.5 py-1 rounded font-medium ${styles.badge}`}>
            {categoryLabel.en}
          </span>
          <span
            className="text-xs px-2.5 py-1 rounded font-mono"
            style={{
              background: "var(--color-surface-raised)",
              color: "var(--color-text-secondary)",
              border: "1px solid var(--color-border)",
            }}
          >
            Root: {name.root}
          </span>
        </div>

        <p
          className="text-sm leading-relaxed max-w-xl mx-auto"
          style={{ color: "var(--color-text-secondary)" }}
        >
          {name.description}
        </p>

        <div
          className="mt-6 text-xs px-4 py-3 rounded-lg max-w-lg mx-auto text-left"
          style={{
            background: "var(--color-surface-raised)",
            border: "1px solid var(--color-border)",
            color: "var(--color-text-muted)",
          }}
        >
          <span className="font-mono" style={{ color: styles.accent }}>
            {categoryLabel.en} · {categoryLabel.ar}
          </span>
          <span className="mx-2" style={{ color: "var(--color-border)" }}>|</span>
          {categoryLabel.description}
        </div>
      </div>

      {/* Verses section */}
      <div className="max-w-3xl mx-auto px-6 py-10">
        <h2
          className="text-xs font-mono uppercase tracking-widest mb-6"
          style={{ color: "var(--color-text-muted)" }}
        >
          Verses of this Name
        </h2>
        <NameVerses slug={slug} accent={styles.accent} />
      </div>

      {/* Name navigation */}
      <div
        className="max-w-3xl mx-auto px-6 py-6 flex justify-between items-center"
        style={{ borderTop: "1px solid var(--color-border-subtle)" }}
      >
        {prevName ? (
          <Link
            href={`/names/${prevName.slug}`}
            className="flex items-center gap-2 text-xs hover:opacity-80 transition-opacity group"
            style={{ color: "var(--color-text-secondary)" }}
          >
            <ArrowLeft className="w-3 h-3" />
            <span className="font-arabic text-base" style={{ color: "var(--color-text-muted)" }}>
              {prevName.arabic}
            </span>
            <span>{prevName.transliteration}</span>
          </Link>
        ) : (
          <span />
        )}

        <Link
          href="/names"
          className="text-xs hover:opacity-80 transition-opacity"
          style={{ color: "var(--color-text-muted)" }}
        >
          All 99
        </Link>

        {nextName ? (
          <Link
            href={`/names/${nextName.slug}`}
            className="flex items-center gap-2 text-xs hover:opacity-80 transition-opacity group"
            style={{ color: "var(--color-text-secondary)" }}
          >
            <span>{nextName.transliteration}</span>
            <span className="font-arabic text-base" style={{ color: "var(--color-text-muted)" }}>
              {nextName.arabic}
            </span>
            <ArrowRight className="w-3 h-3" />
          </Link>
        ) : (
          <span />
        )}
      </div>
    </div>
  );
}
