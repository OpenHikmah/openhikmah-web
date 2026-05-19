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
  data: { kind: EdgeKind; label: string; reason?: string };
}

export interface ConnectionResult {
  surah: number;
  ayah: number;
  ref: VerseRef;
  arabicText: string;
  translation: string;
  surahName: string;
  surahNameArabic: string;
  reason: string;
  kind: EdgeKind;
}

export interface SearchResult {
  ref: VerseRef;
  surahName: string;
  surahNameArabic: string;
  snippet: string;
}

export type SidebarContent =
  | { type: "node"; verse: Verse }
  | {
      type: "edge";
      fromVerse: Verse;
      toVerse: Verse;
      reason: string;
      kind: EdgeKind;
      label: string;
    };

export interface PendingExpand {
  nodeId: string;
  ref: VerseRef;
  kind: EdgeKind;
}
