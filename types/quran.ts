export type VerseRef = `${number}:${number}`;

export interface Verse {
  surah: number;
  ayah: number;
  ref: VerseRef;
  arabicText: string;
  translation: string;
  /** The translation edition `translation` actually carries — the requested one, or
   *  "en.sahih" when the requested edition has no text for this verse. Always set
   *  for verses read from the corpus or resolved live. */
  edition?: string;
  surahName: string;
  surahNameArabic: string;
  isRoot?: boolean;
  isLoading?: boolean;
  /** Canvas only: id of the card whose expansion added this card. The layout
   *  re-run places it in a column beside that card. */
  placedFrom?: string;
  /** Canvas only: the user moved this card by hand, so layout re-runs keep it. */
  pinned?: boolean;
}

export type EdgeKind = "thematic" | "root" | "contrast";

export interface CanvasEdge {
  id: string;
  source: string;
  target: string;
  type: "hikmah";
  data: { kind: EdgeKind; label: string; reason?: string; placeholder?: boolean };
}

export interface ConnectionResult {
  surah: number;
  ayah: number;
  ref: VerseRef;
  arabicText: string;
  translation: string;
  /** The edition `translation` carries, copied from the resolved `Verse`. */
  edition?: string;
  surahName: string;
  surahNameArabic: string;
  reason: string;
  kind: EdgeKind;
  /** Model-reported certainty (0-100) that this is a genuine connection, when
   *  the model supplied one. Absent for responses generated before this field
   *  existed (e.g. an admin's DB-stored prompt override that predates it). */
  confidence?: number;
}

export interface SearchResult {
  ref: VerseRef;
  surahName: string;
  surahNameArabic: string;
  snippet: string;
  arabicText: string;
  translation: string;
}

export interface MatchedSurah {
  number: number;
  name: string;
  nameArabic: string;
  ayahCount: number;
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
  page: number;
  pageSize: number;
  matchedSurahs?: MatchedSurah[];
  /** Best-effort semantic matches related to the query, deduplicated against
   *  `results`. Only present when semantic search genuinely found something. */
  related?: SearchResult[];
}

/** What the reading panel shows. It reads live node/edge data from the canvas
 *  store by id, so it always matches the canvas. `contextNodeId` is the verse
 *  whose connections the connection view steps through. */
export type SidebarContent =
  { type: "node"; nodeId: string } | { type: "edge"; edgeId: string; contextNodeId: string };

export interface PendingExpand {
  nodeId: string;
  ref: VerseRef;
  kind: EdgeKind;
}
