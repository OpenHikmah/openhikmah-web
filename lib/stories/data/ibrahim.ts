import type { Story } from "../types";

export const IBRAHIM_STORY: Story = {
  slug: "ibrahim",
  name: { en: "Ibrahim (Abraham)" },
  arabicName: "إِبْرَاهِيم",
  tagline: { en: "The friend of God who questioned idols, survived fire, and raised the Kaaba" },
  intro: {
    en: "Ibrahim is described in the Quran as a nation unto himself — a model of devotion who confronted his own people's idolatry, was thrown into fire for it and emerged unharmed, and later, with his son Ismail, raised the foundations of the Kaaba. His story runs through the Quran as the root of the monotheistic line that continues through Ishaq, Yaqub, and eventually Muhammad ﷺ.",
  },
  primarySurahs: [21, 37, 2],
  chapters: [
    {
      id: "questioning-the-idols",
      title: { en: '"What are these statues?"' },
      narrative: {
        en: "Ibrahim confronts his father and his people over the statues they worship, and they answer only that they found their fathers doing the same. He tells them plainly that they and their fathers have been in clear error, and declares that their Lord is the Lord of the heavens and the earth — the One who created them. He then breaks the idols into fragments, sparing only the largest, so that his people might question it themselves.",
      },
      verseRefs: ["21:51", "21:52", "21:53", "21:54", "21:55", "21:56", "21:57", "21:58"],
    },
    {
      id: "the-fire",
      title: { en: '"O fire, be coolness and safety"' },
      narrative: {
        en: "When the people discover who broke their idols, they bring Ibrahim before them. He tells them to ask the largest idol itself, if it can speak — a challenge that leaves them silently returning to blame each other before reasserting their anger at him. They resolve to burn him for it. God's response is a single command to the fire itself: to become coolness and safety upon Ibrahim. The plan meant to destroy him instead makes his opponents the ones who lose.",
      },
      verseRefs: [
        "21:59",
        "21:60",
        "21:61",
        "21:62",
        "21:63",
        "21:64",
        "21:65",
        "21:66",
        "21:67",
        "21:68",
        "21:69",
        "21:70",
      ],
    },
    {
      id: "raising-the-house",
      title: { en: "Raising the foundations of the House" },
      narrative: {
        en: "God tells Ibrahim He is making him a leader for the people; Ibrahim asks whether this covenant extends to his descendants, and is told it does not include the wrongdoers among them. He and his son Ismail raise the foundations of the Kaaba together, asking God to accept the work from them, to make them and their descendants people submitted to Him, to show them their rites of worship, and — in a supplication that reaches across the Quran to the coming of a final messenger — to send among their descendants a messenger who would recite God's verses and teach the Book and wisdom.",
      },
      verseRefs: ["2:124", "2:125", "2:126", "2:127", "2:128", "2:129"],
    },
    {
      id: "the-sacrifice",
      title: { en: "The vision and the great ransom" },
      narrative: {
        en: "Ibrahim prays for a righteous child and is given the good news of a forbearing son. When the boy is old enough to work alongside him, Ibrahim tells him of a vision in which he must sacrifice him, and asks what he thinks. The son answers that he will find him, God willing, among the steadfast. As both submit to what has been shown them and Ibrahim lays him down, God calls out that the vision has already been fulfilled — Ibrahim has passed the trial — and ransoms the boy with a great sacrifice instead. God leaves for Ibrahim a lasting mention among later generations: peace upon Ibrahim.",
      },
      verseRefs: [
        "37:100",
        "37:101",
        "37:102",
        "37:103",
        "37:104",
        "37:105",
        "37:106",
        "37:107",
        "37:108",
        "37:109",
        "37:110",
        "37:111",
      ],
    },
  ],
  themes: ["monotheism", "trial", "sacrifice", "the-kaaba"],
  relatedNames: ["al-khaliq", "al-wahid", "al-hakim"],
};
