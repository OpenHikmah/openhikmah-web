import type { Story } from "../types";

export const IDRIS_STORY: Story = {
  slug: "idris",
  name: {
    en: "Idris",
    tr: "İdris",
    az: "İdris",
    ru: "Идрис",
  },
  arabicName: "إِدْرِيس",
  tagline: {
    en: "A man of truth, raised to a high station",
    tr: "Bir doğruluk sahibi, yüce bir makama yükseltildi",
    az: "Bir doğruluq sahibi, yüksək bir məqama yüksəldildi",
    ru: "Человек истины, вознесённый на высокое положение",
  },
  intro: {
    en: "The Quran gives Idris only a few lines, but they are exact: he is named a man of truth and a prophet, and God raised him to a high station. No events are narrated — no people he was sent to, no confrontation, no outcome — only a character description and a single, striking honor. Where the Quran is this brief, this story stays brief too, rather than filling the space with detail the text itself does not give.",
    tr: "Kur'an, İdris hakkında yalnızca birkaç satır verir, fakat bunlar kesindir: o, bir doğruluk sahibi ve bir peygamber olarak anılır ve Allah onu yüce bir makama yükseltmiştir. Hiçbir olay anlatılmaz — gönderildiği bir halk, bir yüzleşme, bir sonuç yoktur — yalnızca bir karakter tasviri ve tek, çarpıcı bir onur. Kur'an bu kadar kısa olduğunda, bu hikâye de kısa kalır, metnin kendisinin vermediği ayrıntılarla boşluğu doldurmak yerine.",
    az: "Quran, İdris haqqında yalnız bir neçə sətir verir, lakin bunlar dəqiqdir: o, bir doğruluq sahibi və bir peyğəmbər olaraq anılır və Allah onu yüksək bir məqama yüksəltmişdir. Heç bir hadisə nəql olunmur — göndərildiyi bir xalq, bir üz-üzə gəlmə, bir nəticə yoxdur — yalnız bir xarakter təsviri və tək, çarpıcı bir şərəf. Quran bu qədər qısa olduqda, bu hekayə də qısa qalır, mətnin özünün vermədiyi təfərrüatlarla boşluğu doldurmaq əvəzinə.",
    ru: "Коран отводит Идрису лишь несколько строк, но они точны: он назван человеком истины и пророком, и Бог вознёс его на высокое положение. Никакие события не повествуются — ни народ, к которому он был послан, ни противостояние, ни исход — лишь описание характера и единственная, поразительная честь. Там, где Коран столь краток, эта история остаётся такой же краткой, а не заполняется деталями, которых сам текст не даёт.",
  },
  primarySurahs: [19, 21],
  chapters: [
    {
      id: "a-man-of-truth",
      title: {
        en: "Raised to a high station",
        tr: "Yüce bir makama yükseltildi",
        az: "Yüksək bir məqama yüksəldildi",
        ru: "Вознесён на высокое положение",
      },
      narrative: {
        en: "The Quran instructs its reader to mention Idris in the Book: indeed, he was a man of truth and a prophet — and We raised him to a high station.",
        tr: "Kur'an, okuyucusuna Kitap'ta İdris'i anmasını buyurur: gerçekten o bir doğruluk sahibi ve bir peygamberdi — ve biz onu yüce bir makama yükselttik.",
        az: "Quran, oxucusuna Kitabda İdrisi anmasını əmr edir: həqiqətən o bir doğruluq sahibi və bir peyğəmbər idi — və biz onu yüksək bir məqama yüksəltdik.",
        ru: "Коран велит своему читателю помянуть Идриса в Писании: поистине, он был человеком истины и пророком — и Мы вознесли его на высокое положение.",
      },
      verseRefs: ["19:56", "19:57"],
    },
    {
      id: "among-the-patient",
      title: {
        en: "All were of the patient",
        tr: "Hepsi sabredenlerdendi",
        az: "Hamısı səbir edənlərdən idi",
        ru: "Все они были из числа терпеливых",
      },
      narrative: {
        en: "Elsewhere Idris is named together with Ismail and Dhul-Kifl: all were of the patient, and We admitted them into Our mercy — indeed, they were of the righteous.",
        tr: "Başka bir yerde İdris, İsmail ve Zülkifl ile birlikte anılır: hepsi sabredenlerdendi ve onları rahmetimize kattık — gerçekten onlar salihlerdendi.",
        az: "Başqa bir yerdə İdris, İsmail və Zülkifl ilə birlikdə anılır: hamısı səbir edənlərdən idi və onları mərhəmətimizə qatdıq — həqiqətən onlar salehlərdən idi.",
        ru: "В другом месте Идрис назван вместе с Исмаилом и Зуль-Кифлем: все они были из числа терпеливых, и Мы допустили их в Нашу милость — поистине, они были из числа праведных.",
      },
      verseRefs: ["21:85", "21:86"],
    },
  ],
  themes: ["truthfulness", "patience", "honor"],
  relatedNames: ["al-ali"],
};
