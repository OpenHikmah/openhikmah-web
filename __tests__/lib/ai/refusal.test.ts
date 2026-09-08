import { describe, it, expect } from "vitest";
import { looksLikeRefusal } from "@/lib/ai/refusal";

describe("looksLikeRefusal", () => {
  it("flags refusal / disclaimer openers", () => {
    for (const s of [
      "I'm sorry, but I can't help with religious interpretation.",
      "I cannot provide a theological reflection on this.",
      "I can't assist with that request.",
      "I won't generate content that could be misused.",
      "As an AI, I don't have the ability to issue religious rulings.",
      "As a language model, I cannot offer this.",
      "I apologize, but this falls outside what I can do.",
      "I must decline to answer.",
      "Unfortunately, I am unable to complete this.",
      "  I'm not able to write that.",
    ]) {
      expect(looksLikeRefusal(s)).toBe(true);
    }
  });

  it("does not flag genuine theological prose", () => {
    for (const s of [
      "The believer's realisation of Al-Latif is not to imagine possessing any share of that subtlety, but to rest the heart in certainty.",
      "Allah is the Subtle, the Acquainted; His awareness reaches what no created perception can access.",
      "In Surah al-An'am (6:103), vision does not grasp Him while He grasps all vision.",
      "Ar-Rahman and Ar-Rahim are paired so universal mercy is completed by mercy specific to the believers.",
      "This name expresses Allah's transcendence over every created limitation.",
      "Imperceptible to the senses, He is nonetheless fully known to Himself.",
      "I-consciousness dissolves before the divine reality in true tawakkul.",
    ]) {
      expect(looksLikeRefusal(s)).toBe(false);
    }
  });
});
