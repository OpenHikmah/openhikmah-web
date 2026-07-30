import type { Story } from "../types";

export const ISA_STORY: Story = {
  slug: "isa",
  name: { en: "Isa (Jesus)" },
  arabicName: "عِيسَىٰ",
  tagline: { en: "Born of a word from God, sent as a messenger to the Children of Israel" },
  intro: {
    en: "Isa's story in the Quran begins before his birth, with the angels' announcement to Maryam, and continues through a birth that left her alone and afraid, a childhood marked by speaking in the cradle, and a prophetic mission of signs performed only by God's permission. The Quran is emphatic on one point above all: Isa was a messenger, not divine, and God raised him to Himself rather than allowing him to be killed.",
  },
  primarySurahs: [3, 19],
  chapters: [
    {
      id: "the-announcement",
      title: { en: '"A word from Him"' },
      narrative: {
        en: 'The angels tell Maryam that God has chosen and purified her above the women of the worlds, and bring her news of a son whose name will be the Messiah, Isa son of Maryam, honored in this world and the next. She asks how she can have a child when no man has touched her; she is told that God creates what He wills, and when He decrees a matter He simply says to it, "Be," and it is. She is told he will speak to people in the cradle and in maturity, and will be taught the Scripture, wisdom, the Torah, and the Gospel.',
      },
      verseRefs: [
        "3:42",
        "3:43",
        "3:44",
        "3:45",
        "3:46",
        "3:47",
        "3:48",
        "19:16",
        "19:17",
        "19:18",
        "19:19",
        "19:20",
        "19:21",
      ],
    },
    {
      id: "the-birth",
      title: { en: "Beneath the palm tree" },
      narrative: {
        en: "Maryam withdraws to a remote place, and the pains of childbirth bring her to the trunk of a palm tree, where she cries out that she wishes she had died before this rather than face what is coming. She is comforted — told not to grieve, that a stream has been provided beneath her and that shaking the palm trunk will drop fresh, ripe dates upon her. When she brings the child to her people, they accuse her, and she simply points to him. To their astonishment, the infant himself speaks, declaring that he is a servant of God, given the Scripture and made a prophet, made dutiful to his mother, and granted peace on the day of his birth, the day of his death, and the day he is raised alive.",
      },
      verseRefs: [
        "19:22",
        "19:23",
        "19:24",
        "19:25",
        "19:26",
        "19:27",
        "19:28",
        "19:29",
        "19:30",
        "19:31",
        "19:32",
        "19:33",
      ],
    },
    {
      id: "signs-and-message",
      title: { en: "Signs by God's permission" },
      narrative: {
        en: "As a messenger to the Children of Israel, Isa performs signs he is careful to attribute entirely to God's permission, not his own power: shaping a bird from clay and breathing life into it, healing the blind and the leper, raising the dead. He confirms the Torah that came before him, and calls his people to fear God and obey him — declaring, in his own words, that God is his Lord and their Lord, and that this alone is the straight path.",
      },
      verseRefs: ["3:49", "3:50", "3:51", "5:110"],
    },
    {
      id: "raised-to-god",
      title: { en: '"They did not kill him, nor did they crucify him"' },
      narrative: {
        en: "Against the claim that Isa was killed, the Quran states directly that he was not killed and not crucified — that it was made to appear so to those who disputed over it, who have no real knowledge of the matter beyond assumption. God raised him to Himself instead. This is presented as a matter of certainty, closing a question the Quran treats as long settled by revelation rather than left open to debate.",
      },
      verseRefs: ["4:157", "4:158"],
    },
  ],
  themes: ["miracles", "prophethood", "monotheism"],
  relatedNames: ["al-khaliq", "al-alim", "al-muhyi"],
};
