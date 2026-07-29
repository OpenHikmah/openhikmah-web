"use client";

import { Settings as SettingsIcon } from "lucide-react";
import { LandingHeader } from "@/components/layout/LandingHeader";
import { Card, Select, Switch, type SelectOption } from "@/components/ui";
import { RECITERS } from "@/lib/quran/audio";
import { usePreferencesStore, type UiLocale } from "@/store/preferences";

const LOCALE_OPTIONS: SelectOption[] = [
  { value: "en", label: "English" },
  { value: "tr", label: "Türkçe" },
  { value: "ru", label: "Русский" },
  { value: "az", label: "Azərbaycan dili" },
];

// Default edition + translator attribution per locale (alquran.cloud codes).
// Only one edition per non-English locale ships in v1; alternates (Diyanet
// Vakfı, Abu Adel, etc.) are a follow-up once the multi-language epic's
// translation storage (verse_translations table) is seeded.
const DEFAULT_EDITION_BY_LOCALE: Record<UiLocale, { edition: string; attribution: string }> = {
  en: { edition: "en.sahih", attribution: "Saheeh International" },
  tr: { edition: "tr.diyanet", attribution: "Diyanet İşleri" },
  ru: { edition: "ru.kuliev", attribution: "Elmir Kuliev" },
  az: { edition: "az.mammadaliyev", attribution: "Mammadaliyev & Bunyadov" },
};

const RECITER_OPTIONS: SelectOption[] = RECITERS.map((r) => ({ value: r.id, label: r.label }));

function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
      {description && <p className="mt-1 text-xs text-text-muted">{description}</p>}
      <div className="mt-4">{children}</div>
    </Card>
  );
}

export default function SettingsPage() {
  const uiLocale = usePreferencesStore((s) => s.uiLocale);
  const setUiLocale = usePreferencesStore((s) => s.setUiLocale);
  const quranEditionByLocale = usePreferencesStore((s) => s.quranEditionByLocale);
  const setQuranEdition = usePreferencesStore((s) => s.setQuranEdition);
  const reciter = usePreferencesStore((s) => s.reciter);
  const setReciter = usePreferencesStore((s) => s.setReciter);
  const canvasPrefs = usePreferencesStore((s) => s.canvasPrefs);
  const setCanvasPrefs = usePreferencesStore((s) => s.setCanvasPrefs);

  const activeEditionDefault = DEFAULT_EDITION_BY_LOCALE[uiLocale];
  const activeEdition = quranEditionByLocale[uiLocale] ?? activeEditionDefault.edition;

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <LandingHeader />
      <div className="mx-auto w-full max-w-2xl flex-1 space-y-4">
        <div className="mb-4 flex items-center gap-3">
          <SettingsIcon className="h-5 w-5 text-gold" />
          <h1 className="text-lg font-semibold text-text-primary">Settings</h1>
        </div>

        <SettingsSection title="Language" description="Sets the app interface language.">
          <Select
            aria-label="Interface language"
            value={uiLocale}
            onValueChange={(v) => setUiLocale(v as UiLocale)}
            options={LOCALE_OPTIONS}
          />
        </SettingsSection>

        <SettingsSection
          title="Quran translation"
          description={`Currently ${DEFAULT_EDITION_BY_LOCALE[uiLocale].attribution} (${activeEdition}).`}
        >
          <Select
            aria-label="Quran translation edition"
            value={activeEdition}
            onValueChange={(v) => setQuranEdition(uiLocale, v)}
            options={[
              { value: activeEditionDefault.edition, label: activeEditionDefault.attribution },
            ]}
          />
        </SettingsSection>

        <SettingsSection title="Recitation" description="Reciter used for verse audio playback.">
          <Select
            aria-label="Reciter"
            value={reciter}
            onValueChange={setReciter}
            options={RECITER_OPTIONS}
          />
        </SettingsSection>

        <SettingsSection title="Canvas">
          <div className="flex items-center justify-between">
            <label htmlFor="canvas-minimap" className="text-sm text-text-secondary">
              Show minimap
            </label>
            <Switch
              id="canvas-minimap"
              aria-label="Show canvas minimap"
              checked={canvasPrefs.showMinimap}
              onCheckedChange={(checked) => setCanvasPrefs({ showMinimap: checked })}
            />
          </div>
        </SettingsSection>
      </div>
    </div>
  );
}
