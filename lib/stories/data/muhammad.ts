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
  name: {
    en: "Muhammad ﷺ",
    tr: "Muhammed ﷺ",
    az: "Məhəmməd ﷺ",
    ru: "Мухаммад ﷺ",
  },
  arabicName: "مُحَمَّد",
  tagline: {
    en: "Sent as a mercy to all the worlds, the seal of the prophets",
    tr: "Bütün âlemlere rahmet olarak gönderilen, peygamberlerin hatemi",
    az: "Bütün aləmlərə rəhmət olaraq göndərilən, peyğəmbərlərin xatəmi",
    ru: "Посланный как милость мирам, печать пророков",
  },
  intro: {
    en: "The Quran speaks of Muhammad ﷺ less as a sequence of events and more through direct address — reassurance in hardship, the moment revelation began, and his standing as the final prophet in the line that runs back through Ibrahim to Adam. This chapter set stays close to what the Quran says about him in its own words, rather than the fuller biographical detail found in hadith and seerah literature.",
    tr: "Kur'an, Muhammed ﷺ'den bir olaylar dizisi olarak değil, daha çok doğrudan hitap yoluyla söz eder — zorluk anındaki teselli, vahyin başladığı an ve İbrahim'den Âdem'e uzanan silsiledeki son peygamber olarak konumu. Bu bölüm dizisi, hadis ve siyer literatüründe bulunan daha kapsamlı biyografik ayrıntılardan çok, Kur'an'ın onun hakkında kendi sözleriyle söylediklerine yakın durur.",
    az: "Quran, Məhəmməd ﷺ-dən hadisələr ardıcıllığı kimi deyil, daha çox birbaşa müraciət vasitəsilə bəhs edir — çətinlik anındakı təsəlli, vəhyin başladığı an və İbrahimdən Adəmə qədər uzanan silsilədə son peyğəmbər olaraq mövqeyi. Bu fəsillər toplusu, hədis və sirə ədəbiyyatında olan daha ətraflı bioqrafik təfərrüatlar əvəzinə, Quranın onun haqqında öz sözləri ilə dediklərinə yaxın qalır.",
    ru: "Коран говорит о Мухаммаде ﷺ не столько как о последовательности событий, сколько через прямое обращение — утешение в трудную минуту, момент начала откровения и его положение как последнего пророка в цепи, восходящей через Ибрахима к Адаму. Эта серия глав придерживается того, что Коран говорит о нём собственными словами, а не более полных биографических подробностей, содержащихся в хадисах и сире.",
  },
  primarySurahs: [96, 93, 94, 33],
  chapters: [
    {
      id: "the-first-recitation",
      title: {
        en: '"Recite, in the name of your Lord"',
        tr: '"Rabbinin adıyla oku"',
        az: '"Rəbbinin adı ilə oxu"',
        ru: '"Читай во имя Господа твоего"',
      },
      narrative: {
        en: "The first words of revelation, addressed to Muhammad ﷺ, open not with a story but with a command: recite, in the name of the Lord who created — who created man from a clinging substance. It continues that his Lord is the most generous, the one who taught by the pen, teaching man what he did not know. Revelation begins, in the Quran's own account, as an act of teaching.",
        tr: "Muhammed ﷺ'e hitap eden vahyin ilk sözleri, bir öyküyle değil bir emirle başlar: Yaratan Rabbinin adıyla oku — insanı yapışkan bir maddeden yaratan Rabbin. Devamında Rabbinin en cömert olan, kalemle öğreten, insana bilmediğini öğreten olduğu belirtilir. Vahiy, Kur'an'ın kendi anlatımına göre, bir öğretme eylemi olarak başlar.",
        az: "Məhəmməd ﷺ-ə ünvanlanan vəhyin ilk sözləri bir hekayə ilə deyil, bir əmrlə başlayır: yaradan Rəbbinin adı ilə oxu — insanı yapışqan bir maddədən yaradan Rəbbin. Davamında Rəbbinin ən səxavətli olan, qələmlə öyrədən, insana bilmədiyini öyrədən olduğu bildirilir. Vəhy, Quranın öz nəqlinə görə, bir öyrətmə əməli kimi başlayır.",
        ru: "Первые слова откровения, обращённые к Мухаммаду ﷺ, начинаются не с рассказа, а с повеления: читай во имя Господа, который сотворил — сотворил человека из сгустка. Далее говорится, что его Господь — самый щедрый, тот, кто научил посредством письменной трости, научив человека тому, чего он не знал. Откровение, по собственному свидетельству Корана, начинается как акт научения.",
      },
      verseRefs: ["96:1", "96:2", "96:3", "96:4", "96:5"],
    },
    {
      id: "comfort-in-hardship",
      title: {
        en: '"Your Lord has not taken leave of you"',
        tr: '"Rabbin seni terk etmedi"',
        az: '"Rəbbin səni tərk etmədi"',
        ru: '"Не покинул тебя Господь твой"',
      },
      narrative: {
        en: "In a passage of direct reassurance during a period of hardship, God tells Muhammad ﷺ that He has not abandoned him nor detested him, and that what comes after will be better than what came before — that his Lord will give him until he is satisfied. He is reminded that he was found an orphan and given refuge, found in need of guidance and guided, found poor and made self-sufficient — and is told, in turn, not to oppress an orphan or turn away one who asks, but to speak of his Lord's favor. A companion passage adds that God expanded his breast, removed the burden that weighed on him, and raised his repute — declaring twice, for emphasis, that with hardship comes ease.",
        tr: "Bir zorluk döneminde doğrudan teselli veren bir bölümde Allah, Muhammed ﷺ'e onu terk etmediğini ve ona darılmadığını, sonrakinin öncekinden daha hayırlı olacağını — Rabbinin ona, o hoşnut oluncaya kadar vereceğini söyler. Kendisine, yetim bulunup barındırıldığı, yol gösterilmeye muhtaç bulunup doğru yola iletildiği, yoksul bulunup zengin kılındığı hatırlatılır — buna karşılık, yetimi ezmemesi, isteyeni geri çevirmemesi, ancak Rabbinin nimetini dile getirmesi söylenir. Buna eşlik eden bir bölüm ise Allah'ın onun göğsünü genişlettiğini, üzerindeki yükü kaldırdığını ve şânını yücelttiğini ekler — vurgu için iki kez, zorlukla birlikte kolaylığın da geleceğini bildirir.",
        az: "Çətinlik dövründə birbaşa təsəlli verən bir hissədə Allah Məhəmməd ﷺ-ə onu tərk etmədiyini və ona qəzəblənmədiyini, sonrakının əvvəlkindən daha xeyirli olacağını — Rəbbinin ona, o razı qalana qədər verəcəyini bildirir. Ona yetim ikən sığınacaq verildiyi, hidayətə möhtac ikən doğru yola yönəldildiyi, yoxsul ikən dövlətli edildiyi xatırladılır — buna qarşılıq, yetimi əzməməsi, dilənçini geri qaytarmaması, ancaq Rəbbinin nemətindən danışması buyurulur. Buna müşayiət edən bir hissə isə Allahın onun köksünü genişləndirdiyini, üzərindəki yükü qaldırdığını və şöhrətini ucaltdığını əlavə edir — vurğu üçün iki dəfə, çətinliklə birlikdə asanlığın gələcəyini bəyan edir.",
        ru: "В отрывке прямого утешения в период трудности Бог говорит Мухаммаду ﷺ, что Он не оставил его и не возненавидел, и что последующее будет лучше предыдущего — что его Господь одарит его так, что он будет удовлетворён. Ему напоминают, что он был найден сиротой и получил прибежище, найден нуждающимся в наставлении и был наставлен, найден бедным и стал самодостаточным — и в свою очередь ему сказано не притеснять сироту и не отталкивать просящего, а говорить о милости своего Господа. Сопутствующий отрывок добавляет, что Бог расширил его грудь, снял с него тяготившее его бремя и возвысил его упоминание — дважды, для выразительности, провозглашая, что вместе с трудностью приходит облегчение.",
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
      title: {
        en: '"Do not grieve; indeed God is with us"',
        tr: '"Üzülme, şüphesiz Allah bizimle beraberdir"',
        az: '"Kədərlənmə, şübhəsiz Allah bizimlədir"',
        ru: '"Не печалься, ведь Аллах с нами"',
      },
      narrative: {
        en: "Recalling a moment when Muhammad ﷺ was driven out by disbelievers as one of two, sheltering in a cave, the Quran records him telling his companion not to grieve, for God was with them — and states that God sent down tranquility upon him, supported him with unseen forces, and made His word the highest. The passage does not narrate the wider journey; it isolates this single moment of reassurance under pressure.",
        tr: "İkinin biri olarak inkârcılar tarafından çıkarıldığı, bir mağarada sığındığı bir anı hatırlatan Kur'an, onun arkadaşına üzülmemesini, çünkü Allah'ın onlarla beraber olduğunu söylediğini kaydeder — ve Allah'ın üzerine bir sükûnet indirdiğini, onu görünmeyen güçlerle desteklediğini ve kendi sözünü en yüce kıldığını belirtir. Bölüm daha geniş yolculuğu anlatmaz; baskı altındaki bu tek teselli anını tek başına ele alır.",
        az: "İkisindən biri olaraq kafirlər tərəfindən çıxarıldığı, bir mağarada sığındığı anı xatırladan Quran, onun yoldaşına kədərlənməməsini, çünki Allahın onlarla birlikdə olduğunu dediyini qeyd edir — və Allahın onun üzərinə sükunət endirdiyini, onu görünməz qüvvələrlə dəstəklədiyini və Öz sözünü ən uca etdiyini bildirir. Bu hissə daha geniş səyahəti nəql etmir; təzyiq altındakı bu tək təsəlli anını təcrid olunmuş şəkildə göstərir.",
        ru: "Напоминая момент, когда Мухаммад ﷺ был изгнан неверующими, будучи одним из двух, и укрылся в пещере, Коран передаёт, как он сказал своему спутнику не печалиться, ибо Аллах был с ними — и сообщает, что Аллах ниспослал на него спокойствие, поддержал его невидимыми силами и сделал Своё слово наивысшим. Этот отрывок не повествует о более широком пути; он выделяет только этот единственный момент утешения под давлением.",
      },
      verseRefs: ["9:40"],
    },
    {
      id: "seal-of-the-prophets",
      title: {
        en: "A mercy to all the worlds",
        tr: "Bütün âlemlere rahmet",
        az: "Bütün aləmlərə rəhmət",
        ru: "Милость для всех миров",
      },
      narrative: {
        en: "The Quran describes Muhammad ﷺ as the Messenger of God and the seal of the prophets — the last in the line that included Adam, Nuh, Ibrahim, Musa, and Isa before him. Elsewhere it states plainly that he was sent for no other reason than as a mercy to all the worlds, not to a single people or place. It is the note the Quran leaves this chapter of prophetic history on: not conquest or status, but mercy, offered to everyone.",
        tr: "Kur'an, Muhammed ﷺ'i Allah'ın Elçisi ve peygamberlerin hatemi olarak tanımlar — kendisinden önce Âdem, Nuh, İbrahim, Musa ve İsa'nın da bulunduğu silsiledeki sonuncusu. Başka bir yerde ise onun, tek bir topluluğa ya da yere değil, sadece ve sadece bütün âlemlere rahmet olarak gönderildiği açıkça belirtilir. Kur'an'ın peygamberlik tarihinin bu bölümünü bıraktığı nokta budur: fetih veya makam değil, herkese sunulan rahmet.",
        az: "Quran Məhəmməd ﷺ-i Allahın Elçisi və peyğəmbərlərin xatəmi kimi təsvir edir — ondan əvvəl Adəm, Nuh, İbrahim, Musa və İsanın da olduğu silsilədə sonuncusu. Başqa bir yerdə isə onun, tək bir xalqa və ya məkana deyil, sadəcə bütün aləmlərə rəhmət olaraq göndərildiyi açıq şəkildə bildirilir. Quranın peyğəmbərlik tarixinin bu fəslini bitirdiyi məqam budur: fəth və ya məqam deyil, hər kəsə təqdim olunan rəhmət.",
        ru: "Коран описывает Мухаммада ﷺ как Посланника Аллаха и печать пророков — последнего в цепи, включавшей до него Адама, Нуха, Ибрахима, Мусу и Ису. В другом месте прямо говорится, что он был послан лишь по одной причине — как милость для всех миров, а не для одного народа или места. Именно на этой ноте Коран завершает эту главу пророческой истории: не завоевание и не статус, а милость, предложенная каждому.",
      },
      verseRefs: ["33:40", "21:107"],
    },
  ],
  themes: ["revelation", "mercy", "hardship", "finality-of-prophethood"],
  relatedNames: ["ar-rahman", "ar-rahim", "al-hadi"],
};
