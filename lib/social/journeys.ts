/**
 * One-tap "journeys" — a theme mapped to a representative verse that opens
 * directly on the canvas. Shared by the marketing hero and the signed-in home so
 * the starting points stay in sync.
 */
export interface Journey {
  /** Key into the "canvas.journey" messages namespace — resolve with useTranslations("canvas"). */
  labelKey: "patience" | "mercy" | "light" | "gratitude";
  ref: string;
}

export const JOURNEYS: Journey[] = [
  { labelKey: "patience", ref: "2:153" },
  { labelKey: "mercy", ref: "1:3" },
  { labelKey: "light", ref: "24:35" },
  { labelKey: "gratitude", ref: "14:7" },
];
