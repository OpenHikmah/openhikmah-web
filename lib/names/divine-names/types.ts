export type NameCategory = "dhat" | "sifat" | "af'al";

export interface DivineName {
  id: number;
  slug: string;
  arabic: string;
  transliteration: string;
  meaning: string;
  category: NameCategory;
  root: string;
  description: string;
}
