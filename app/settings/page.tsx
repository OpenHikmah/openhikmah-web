"use client";

import { Settings as SettingsIcon } from "lucide-react";
import { LandingHeader } from "@/components/layout/LandingHeader";
import { Card, Select, Switch, type SelectOption } from "@/components/ui";
import { RECITERS } from "@/lib/quran/audio";
import { DEFAULT_EDITION_BY_LOCALE as EDITION_BY_LOCALE } from "@/lib/i18n/config";
import { usePreferencesStore, type UiLocale } from "@/store/preferences";

const LOCALE_OPTIONS: SelectOption[] = [
  { value: "en", label: "English" },
  { value: "tr", label: "Türkçe" },
  { value: "ru", label: "Русский" },
  { value: "az", label: "Azərbaycan dili" },
];

// Translator attribution per locale, shown alongside the edition code from
// lib/i18n/config's DEFAULT_EDITION_BY_LOCALE (the whitelisted source of
// truth for the codes themselves). Only one edition per non-English locale
// ships in v1; alternates (Diyanet Vakfı, Abu Adel, etc.) are a follow-up
// once lib/i18n/config's VALID_EDITIONS grows beyond the four defaults.
const ATTRIBUTION_BY_LOCALE: Record<UiLocale, string> = {
  en: "Saheeh International",
  tr: "Diyanet İşleri",
  ru: "Elmir Kuliev",
  az: "Mammadaliyev & Bunyadov",
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

  const activeEditionDefault = EDITION_BY_LOCALE[uiLocale];
  const activeAttribution = ATTRIBUTION_BY_LOCALE[uiLocale];
  const activeEdition = quranEditionByLocale[uiLocale] ?? activeEditionDefault;

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
          description={`Currently ${activeAttribution} (${activeEdition}).`}
        >
          <Select
            aria-label="Quran translation edition"
            value={activeEdition}
            onValueChange={(v) => setQuranEdition(uiLocale, v)}
            options={[{ value: activeEditionDefault, label: activeAttribution }]}
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
