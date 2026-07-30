import type { Story } from "../types";

/**
 * Kept strictly to the Quran's own self-referential verses about the Prophet ﷺ
 * (his revelation, his hardship, his emigration, his standing as final
 * messenger) rather than seerah narrative detail — dates, named companions, or
 * scene-setting — that the Quran itself does not state. Where the Quran is
 * silent, this story stays silent, per AGENTS.md's theological standards.
 */
export const MUHAMMAD_STORY: Story = {
  slug: "muhammad",
  name: { en: "Muhammad ﷺ" },
  arabicName: "مُحَمَّد",
  tagline: { en: "Sent as a mercy to all the worlds, the seal of the prophets" },
  intro: {
    en: "The Quran speaks of Muhammad ﷺ less as a sequence of events and more through direct address — reassurance in hardship, the moment revelation began, and his standing as the final prophet in the line that runs back through Ibrahim to Adam. This chapter set stays close to what the Quran says about him in its own words, rather than the fuller biographical detail found in hadith and seerah literature.",
  },
  primarySurahs: [96, 93, 94, 33],
  chapters: [
    {
      id: "the-first-recitation",
      title: { en: '"Recite, in the name of your Lord"' },
      narrative: {
        en: "The first words of revelation, addressed to Muhammad ﷺ, open not with a story but with a command: recite, in the name of the Lord who created — who created man from a clinging substance. It continues that his Lord is the most generous, the one who taught by the pen, teaching man what he did not know. Revelation begins, in the Quran's own account, as an act of teaching.",
      },
      verseRefs: ["96:1", "96:2", "96:3", "96:4", "96:5"],
    },
    {
      id: "comfort-in-hardship",
      title: { en: '"Your Lord has not taken leave of you"' },
      narrative: {
        en: "In a passage of direct reassurance during a period of hardship, God tells Muhammad ﷺ that He has not abandoned him nor detested him, and that what comes after will be better than what came before — that his Lord will give him until he is satisfied. He is reminded that he was found an orphan and given refuge, found in need of guidance and guided, found poor and made self-sufficient — and is told, in turn, not to oppress an orphan or turn away one who asks, but to speak of his Lord's favor. A companion passage adds that God expanded his breast, removed the burden that weighed on him, and raised his repute — declaring twice, for emphasis, that with hardship comes ease.",
      },
      verseRefs: [
        "93:1",
        "93:2",
        "93:3",
        "93:4",
        "93:5",
        "93:6",
        "93:7",
        "93:8",
        "93:9",
        "93:10",
        "93:11",
        "94:1",
        "94:2",
        "94:3",
        "94:4",
        "94:5",
        "94:6",
      ],
    },
    {
      id: "in-the-cave",
      title: { en: '"Do not grieve; indeed God is with us"' },
      narrative: {
        en: "Recalling a moment when Muhammad ﷺ was driven out by disbelievers as one of two, sheltering in a cave, the Quran records him telling his companion not to grieve, for God was with them — and states that God sent down tranquility upon him, supported him with unseen forces, and made His word the highest. The passage does not narrate the wider journey; it isolates this single moment of reassurance under pressure.",
      },
      verseRefs: ["9:40"],
    },
    {
      id: "seal-of-the-prophets",
      title: { en: "A mercy to all the worlds" },
      narrative: {
        en: "The Quran describes Muhammad ﷺ as the Messenger of God and the seal of the prophets — the last in the line that included Adam, Nuh, Ibrahim, Musa, and Isa before him. Elsewhere it states plainly that he was sent for no other reason than as a mercy to all the worlds, not to a single people or place. It is the note the Quran leaves this chapter of prophetic history on: not conquest or status, but mercy, offered to everyone.",
      },
      verseRefs: ["33:40", "21:107"],
    },
  ],
  themes: ["revelation", "mercy", "hardship", "finality-of-prophethood"],
  relatedNames: ["ar-rahman", "ar-rahim", "al-hadi"],
};
