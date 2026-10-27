import { describe, it, expect } from "vitest";
import { STORIES } from "@/lib/stories";
import { ADAM_STORY } from "@/lib/stories/data/adam";
import { ALYASA_STORY } from "@/lib/stories/data/alyasa";
import { AYYUB_STORY } from "@/lib/stories/data/ayyub";
import { DAWUD_STORY } from "@/lib/stories/data/dawud";
import { DHUL_KIFL_STORY } from "@/lib/stories/data/dhul-kifl";
import { HUD_STORY } from "@/lib/stories/data/hud";
import { IBRAHIM_STORY } from "@/lib/stories/data/ibrahim";
import { IDRIS_STORY } from "@/lib/stories/data/idris";
import { ILYAS_STORY } from "@/lib/stories/data/ilyas";
import { ISA_STORY } from "@/lib/stories/data/isa";
import { ISHAQ_STORY } from "@/lib/stories/data/ishaq";
import { ISMAIL_STORY } from "@/lib/stories/data/ismail";
import { LUT_STORY } from "@/lib/stories/data/lut";
import { MUHAMMAD_STORY } from "@/lib/stories/data/muhammad";
import { MUSA_STORY } from "@/lib/stories/data/musa";
import { NUH_STORY } from "@/lib/stories/data/nuh";
import { SALIH_STORY } from "@/lib/stories/data/salih";
import { SHUAYB_STORY } from "@/lib/stories/data/shuayb";
import { SULAIMAN_STORY } from "@/lib/stories/data/sulaiman";
import { YAHYA_STORY } from "@/lib/stories/data/yahya";
import { YAQUB_STORY } from "@/lib/stories/data/yaqub";
import { YUNUS_STORY } from "@/lib/stories/data/yunus";
import { YUSUF_STORY } from "@/lib/stories/data/yusuf";
import { ZAKARIYA_STORY } from "@/lib/stories/data/zakariya";

// slug each data module must declare. Keeping the file name and the slug in
// lock-step is what lets the route `/stories/<slug>` find its content.
const DATA_FILES = {
  adam: ADAM_STORY,
  alyasa: ALYASA_STORY,
  ayyub: AYYUB_STORY,
  dawud: DAWUD_STORY,
  "dhul-kifl": DHUL_KIFL_STORY,
  hud: HUD_STORY,
  ibrahim: IBRAHIM_STORY,
  idris: IDRIS_STORY,
  ilyas: ILYAS_STORY,
  isa: ISA_STORY,
  ishaq: ISHAQ_STORY,
  ismail: ISMAIL_STORY,
  lut: LUT_STORY,
  muhammad: MUHAMMAD_STORY,
  musa: MUSA_STORY,
  nuh: NUH_STORY,
  salih: SALIH_STORY,
  shuayb: SHUAYB_STORY,
  sulaiman: SULAIMAN_STORY,
  yahya: YAHYA_STORY,
  yaqub: YAQUB_STORY,
  yunus: YUNUS_STORY,
  yusuf: YUSUF_STORY,
  zakariya: ZAKARIYA_STORY,
} as const;

describe("story data files", () => {
  it("each file declares the slug it is registered under", () => {
    for (const [slug, story] of Object.entries(DATA_FILES)) {
      expect(story.slug, slug).toBe(slug);
    }
  });

  it("every data file is registered in STORIES as the very same object, and nothing else is", () => {
    const registered = new Set<unknown>(STORIES);
    for (const [slug, story] of Object.entries(DATA_FILES)) {
      expect(registered.has(story), `${slug} is not registered in STORIES`).toBe(true);
    }
    expect(STORIES).toHaveLength(Object.keys(DATA_FILES).length);
  });

  it("each story has at least one chapter and one theme", () => {
    for (const story of Object.values(DATA_FILES)) {
      expect(story.chapters.length, story.slug).toBeGreaterThan(0);
      expect(story.themes.length, story.slug).toBeGreaterThan(0);
    }
  });
});
