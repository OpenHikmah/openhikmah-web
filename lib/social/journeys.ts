/**
 * One-tap "journeys" — a theme mapped to a representative verse that opens
 * directly on the canvas. Shared by the marketing hero and the signed-in home so
 * the starting points stay in sync.
 */
export interface Journey {
  label: string;
  ref: string;
}

export const JOURNEYS: Journey[] = [
  { label: "Patience", ref: "2:153" },
  { label: "Mercy", ref: "1:3" },
  { label: "Light", ref: "24:35" },
  { label: "Gratitude", ref: "14:7" },
];
