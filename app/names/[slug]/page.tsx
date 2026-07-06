import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import {
  getNameBySlug,
  DIVINE_NAMES,
  CATEGORY_LABELS,
  type NameCategory,
} from "@/lib/divine-names";
import { Wordmark } from "@/components/layout/Wordmark";
import { NameVerses } from "./NameVerses";
import { NameReflection } from "./NameReflection";
import { NamePairings } from "./NamePairings";

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
    badge: "border border-gold/30 bg-gold/15 text-gold",
  },
  sifat: {
    accent: "var(--color-teal)",
    badge: "border border-teal/30 bg-teal/15 text-text-primary",
  },
  "af'al": {
    accent: "var(--color-accent)",
    badge: "border border-accent/30 bg-accent/15 text-accent-soft",
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
    <div className="min-h-screen bg-bg text-text-primary">
      {/* Header */}
      <header className="sticky top-0 z-20 flex h-12 items-center justify-between border-b border-border bg-surface px-6">
        <Wordmark />
        <Link
          href="/names"
          className="flex items-center gap-1.5 text-xs text-text-secondary transition-colors hover:text-text-primary"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>All Names</span>
        </Link>
      </header>

      {/* Name hero */}
      <div className="mx-auto max-w-3xl border-b border-border-subtle px-6 pt-14 pb-12 text-center">
        <div className="mb-6 inline-block rounded border border-border bg-surface-raised px-2 py-1 font-mono text-xs text-text-muted">
          #{name.id} of 99
        </div>

        <h1 className="mb-3 font-arabic text-7xl" style={{ color: styles.accent }}>
          {name.arabic}
        </h1>

        <p className="mb-2 font-mono text-xl text-text-primary">{name.transliteration}</p>

        <p className="mb-6 text-lg text-text-secondary">{name.meaning}</p>

        <div className="mb-6 flex flex-wrap items-center justify-center gap-3">
          <span className={`rounded px-2.5 py-1 text-xs font-medium ${styles.badge}`}>
            {categoryLabel.en}
          </span>
          <span className="rounded border border-border bg-surface-raised px-2.5 py-1 font-mono text-xs text-text-secondary">
            Root: {name.root}
          </span>
        </div>

        <p className="mx-auto max-w-xl text-sm leading-relaxed text-text-secondary">
          {name.description}
        </p>
      </div>

      {/* Reflection + Pairings + Verses */}
      <div className="max-w-3xl mx-auto px-6 py-10 space-y-10">
        {/* Believer's Reflection */}
        <NameReflection slug={slug} accent={styles.accent} />

        {/* Structural Pairings */}
        <NamePairings slug={slug} accent={styles.accent} />

        {/* Verse Feed */}
        <div>
          <h2 className="mb-6 font-mono text-xs uppercase tracking-widest text-text-muted">
            Verses of this Name
          </h2>
          <NameVerses slug={slug} accent={styles.accent} />
        </div>
      </div>

      {/* Name navigation */}
      <div className="mx-auto flex max-w-3xl items-center justify-between border-t border-border-subtle px-6 py-6">
        {prevName ? (
          <Link
            href={`/names/${prevName.slug}`}
            className="group flex items-center gap-2 text-xs text-text-secondary transition-opacity hover:opacity-80"
          >
            <ArrowLeft className="h-3 w-3" />
            <span className="font-arabic text-base text-text-muted">{prevName.arabic}</span>
            <span>{prevName.transliteration}</span>
          </Link>
        ) : (
          <span />
        )}

        <Link href="/names" className="text-xs text-text-muted transition-opacity hover:opacity-80">
          All 99
        </Link>

        {nextName ? (
          <Link
            href={`/names/${nextName.slug}`}
            className="group flex items-center gap-2 text-xs text-text-secondary transition-opacity hover:opacity-80"
          >
            <span>{nextName.transliteration}</span>
            <span className="font-arabic text-base text-text-muted">{nextName.arabic}</span>
            <ArrowRight className="h-3 w-3" />
          </Link>
        ) : (
          <span />
        )}
      </div>
    </div>
  );
}
