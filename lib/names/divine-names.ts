import { DIVINE_NAMES } from "./divine-names/data";
import type { DivineName, NameCategory } from "./divine-names/types";

export type { DivineName, NameCategory } from "./divine-names/types";
export { CATEGORY_LABELS } from "./divine-names/categories";
export { DIVINE_NAMES } from "./divine-names/data";

export function getNameBySlug(slug: string): DivineName | undefined {
  return DIVINE_NAMES.find((n) => n.slug === slug);
}

export function getNamesByCategory(category: NameCategory): DivineName[] {
  return DIVINE_NAMES.filter((n) => n.category === category);
}
