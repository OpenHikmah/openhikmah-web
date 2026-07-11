import type { DivineName } from "../types";
import { AFAL_NAMES } from "./afal";
import { DHAT_NAMES } from "./dhat";
import { SIFAT_NAMES } from "./sifat";

export const DIVINE_NAMES: DivineName[] = [...DHAT_NAMES, ...SIFAT_NAMES, ...AFAL_NAMES].sort(
  (a, b) => a.id - b.id
);
