import type { NameCategory } from "./types";

/**
 * Maps each category to the `names` namespace translation keys carrying its
 * localized label/description, so callers don't fall back to CATEGORY_LABELS'
 * English-only `.en`/`.description` fields outside the `en` locale.
 */
export const CATEGORY_LABEL_KEYS: Record<NameCategory, { label: string; description: string }> = {
  dhat: { label: "categoryDhatLabel", description: "categoryDhatDescription" },
  sifat: { label: "categorySifatLabel", description: "categorySifatDescription" },
  "af'al": { label: "categoryAfalLabel", description: "categoryAfalDescription" },
};

export const CATEGORY_LABELS: Record<
  NameCategory,
  { en: string; ar: string; description: string }
> = {
  dhat: {
    en: "Sifat al-Dhat",
    ar: "صفات الذات",
    description:
      "Attributes of the Divine Essence — necessarily and eternally true of Allah independent of creation",
  },
  sifat: {
    en: "Sifat al-Ma'ani",
    ar: "صفات المعاني",
    description:
      "Attributes of Meaning — the seven positive qualities (Knowledge, Power, Will, Life, Hearing, Sight, Speech) and names expressing tanzih (transcendence)",
  },
  "af'al": {
    en: "Sifat al-Af'al",
    ar: "صفات الأفعال",
    description:
      "Attributes of Act — names that express Allah's sovereign relation to creation: creating, providing, guiding, forgiving",
  },
};
