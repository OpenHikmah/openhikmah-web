"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import * as Popover from "@radix-ui/react-popover";
import { Loader2 } from "lucide-react";
import { tokenizeVerse, type MorphologyWord, type VerseToken } from "@/lib/quran/arabic-morphology";

interface InteractiveVerse {
  ref: string;
  surah: number;
  ayah: number;
  arabicText: string;
}

interface ConcordanceVerse {
  ref: string;
  surahName: string;
  surahNameArabic: string;
  snippet: string;
}

/**
 * Renders a verse's Arabic with its root-bearing words made interactive: hover/tap
 * a word to see its root + lemma and a concordance of other verses sharing the
 * root (each a one-tap jump onto the canvas, reusing the ?verse= loader). Words
 * without seeded morphology render as plain text, so this degrades cleanly.
 *
 * Mount per verse (key on the ref) so token state resets cleanly between verses.
 */
export function InteractiveArabic({ verse }: { verse: InteractiveVerse }) {
  // Tag stored morphology with its verse ref so stale callbacks are ignored.
  const [morphology, setMorphology] = useState<{ ref: string; words: MorphologyWord[] }>({
    ref: "",
    words: [],
  });

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/verse/${verse.surah}/${verse.ayah}/morphology`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : { words: [] }))
      .then((data: { words?: MorphologyWord[] }) => {
        setMorphology({ ref: verse.ref, words: data.words ?? [] });
      })
      .catch(() => {
        // Aborted on verse change, or failed — leave plain-text tokens.
      });
    return () => controller.abort();
  }, [verse.surah, verse.ayah, verse.ref]);

  // tokens is always derived from the current verse.arabicText prop. Morphology
  // is only applied when it matches the current ref — stale data is silently skipped.
  const tokens = useMemo(
    () => tokenizeVerse(verse.arabicText, morphology.ref === verse.ref ? morphology.words : []),
    [verse.arabicText, verse.ref, morphology]
  );

  return (
    <p dir="rtl" className="font-arabic text-right text-lg leading-loose text-text-primary">
      {tokens.map((token, i) => (
        <span key={i}>
          {i > 0 ? " " : ""}
          {token.root ? <WordPopover token={token} currentRef={verse.ref} /> : token.text}
        </span>
      ))}
    </p>
  );
}

function WordPopover({ token, currentRef }: { token: VerseToken; currentRef: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [verses, setVerses] = useState<ConcordanceVerse[] | null>(null);

  const loadConcordance = () => {
    if (verses !== null || loading || !token.root) return;
    setLoading(true);
    fetch(`/api/root/${encodeURIComponent(token.root)}`)
      .then((r) => (r.ok ? r.json() : { verses: [] }))
      .then((data: { verses?: ConcordanceVerse[] }) => {
        const others = (data.verses ?? []).filter((v) => v.ref !== currentRef).slice(0, 8);
        setVerses(others);
      })
      .catch(() => setVerses([]))
      .finally(() => setLoading(false));
  };

  return (
    <Popover.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) loadConcordance();
      }}
    >
      <Popover.Trigger asChild>
        <button
          aria-label={`${token.text}, show root and related verses`}
          className="cursor-pointer rounded underline decoration-dotted decoration-text-muted underline-offset-4 transition-colors hover:text-gold hover:decoration-gold"
        >
          {token.text}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          dir="ltr"
          side="bottom"
          align="center"
          sideOffset={6}
          collisionPadding={12}
          className="z-50 w-64 rounded-md border border-border bg-surface-overlay p-3 shadow-floating data-[state=open]:animate-[fadeIn_120ms_ease-out]"
        >
          <div className="flex items-baseline justify-between gap-2">
            <span dir="rtl" className="font-arabic text-base text-gold">
              {token.root}
            </span>
            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-muted">
              Root
            </span>
          </div>
          {token.lemma && (
            <p dir="rtl" className="mt-1 font-arabic text-sm text-text-secondary">
              {token.lemma}
            </p>
          )}

          <div className="mt-3 border-t border-border pt-2">
            <p className="mb-1.5 text-[11px] font-medium text-text-muted">
              Verses sharing this root
            </p>
            {loading ? (
              <div className="flex justify-center py-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-text-muted" />
              </div>
            ) : verses && verses.length > 0 ? (
              <ul className="space-y-0.5">
                {verses.map((v) => (
                  <li key={v.ref}>
                    <Link
                      href={`/canvas?verse=${v.ref}`}
                      onClick={() => setOpen(false)}
                      className="block rounded px-1.5 py-1 transition-colors hover:bg-white/5"
                    >
                      <span className="font-mono text-xs text-gold">{v.ref}</span>
                      <span className="ml-1.5 text-xs text-text-muted">{v.surahName}</span>
                      <span className="mt-0.5 block truncate text-[11px] text-text-secondary">
                        {v.snippet}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-1 text-[11px] text-text-muted">No other verses found yet.</p>
            )}
          </div>

          <Popover.Arrow className="fill-[var(--color-surface-overlay)]" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
