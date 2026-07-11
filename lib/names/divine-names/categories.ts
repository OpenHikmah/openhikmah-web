import type { NameCategory } from "./types";

export const CATEGORY_LABELS: Record<NameCategory, { en: string; ar: string; description: string }> = {
  dhat: {
    en: "Sifat al-Dhat",
    ar: "صفات الذات",
    description: "Attributes of the Divine Essence — necessarily and eternally true of Allah independent of creation",
  },
  sifat: {
    en: "Sifat al-Ma'ani",
    ar: "صفات المعاني",
    description: "Attributes of Meaning — the seven positive qualities (Knowledge, Power, Will, Life, Hearing, Sight, Speech) and names expressing tanzih (transcendence)",
  },
  "af'al": {
    en: "Sifat al-Af'al",
    ar: "صفات الأفعال",
    description: "Attributes of Act — names that express Allah's sovereign relation to creation: creating, providing, guiding, forgiving",
  },
};
