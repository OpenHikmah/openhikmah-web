export type VerseRef = `${number}:${number}`;

export interface Verse {
  surah: number;
  ayah: number;
  ref: VerseRef;
  arabicText: string;
  translation: string;
  surahName: string;
  surahNameArabic: string;
  isRoot?: boolean;
  isLoading?: boolean;
}

export type EdgeKind = "thematic" | "root" | "contrast";

export interface Connection {
  fromRef: VerseRef;
  toRef: VerseRef;
  kind: EdgeKind;
  label: string;
}

export interface CanvasEdge {
  id: string;
  source: string;
  target: string;
  type: "hikmah";
  data: { kind: EdgeKind; label: string };
}
