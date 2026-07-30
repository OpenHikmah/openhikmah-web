import type { Story } from "../types";

export const ADAM_STORY: Story = {
  slug: "adam",
  name: { en: "Adam" },
  arabicName: "آدم",
  tagline: { en: "The first human, taught the names of all things" },
  intro: {
    en: "Adam is honored in the Quran as the first human being and the first prophet — created to serve as a vicegerent on earth, taught knowledge no angel possessed, and, after a single act of heedlessness, the first to be forgiven through repentance. His story sets the pattern the Quran returns to again and again: creation, trial, and mercy.",
  },
  primarySurahs: [2, 7, 20],
  chapters: [
    {
      id: "the-vicegerent",
      title: { en: "A vicegerent on earth" },
      narrative: {
        en: "When God tells the angels He is placing a vicegerent on earth, they ask why a being capable of corruption and bloodshed should be given this role, when they themselves glorify Him constantly. God answers that He knows what they do not. He then teaches Adam the names of all things — a knowledge the angels themselves lack when asked to recite it — and has Adam inform them of it. It is this capacity for knowledge, not mere existence, that the Quran presents as the basis for Adam's honor.",
      },
      verseRefs: ["2:30", "2:31", "2:32", "2:33"],
    },
    {
      id: "the-refusal-of-iblis",
      title: { en: "The one who refused to bow" },
      narrative: {
        en: "God commands the angels to prostrate before Adam, and all of them do — except Iblis, who refuses out of arrogance, arguing he is superior because he was created from fire while Adam was created from clay. God expels him, but Iblis asks for, and is granted, a reprieve until the Day of Resurrection, vowing to waylay Adam's descendants from every direction. It is a warning placed at the very start of human history: enmity from Iblis is named explicitly, not left implicit.",
      },
      verseRefs: ["2:34", "7:11", "7:12", "7:13", "7:14", "7:15", "7:16", "7:17", "7:18"],
    },
    {
      id: "the-garden-and-return",
      title: { en: "The tree, the fall, and forgiveness" },
      narrative: {
        en: "Adam and his wife are settled in the Garden and permitted everything except one tree. Satan works on them through whispered suggestion until they eat from it, after which they immediately recognize their exposure and their error. Both turn to God at once, saying they have wronged themselves and asking for forgiveness and mercy — and are forgiven. They are then told to descend to the earth, which the Quran frames not as punishment alone but as the setting for the guidance that would follow, guidance whose acceptance would end all fear and grief.",
      },
      verseRefs: ["7:19", "7:20", "7:21", "7:22", "7:23", "7:24", "7:25", "2:37", "2:38"],
    },
  ],
  themes: ["creation", "repentance", "knowledge"],
  relatedNames: ["al-khaliq", "al-ghafur", "at-tawwab"],
};
