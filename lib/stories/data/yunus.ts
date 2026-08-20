import type { Story } from "../types";

export const YUNUS_STORY: Story = {
  slug: "yunus",
  name: {
    en: "Yunus (Jonah)",
    tr: "Yunus",
    az: "Yunus",
    ru: "Юнус",
  },
  arabicName: "يُونُس",
  tagline: {
    en: "The prophet swallowed by a fish, and the one people whose repentance came in time",
    tr: "Bir balık tarafından yutulan peygamber ve tövbesi tam vaktinde gelen tek topluluk",
    az: "Bir balıq tərəfindən udulan peyğəmbər və tövbəsi tam vaxtında gələn yeganə xalq",
    ru: "Пророк, проглоченный рыбой, и единственный народ, чьё покаяние подоспело вовремя",
  },
  intro: {
    en: "Yunus is remembered in the Quran for two things at once: leaving his people before God commanded him to, and being the one prophet whose people believed after seeing the punishment approach — and were spared because of it. His own story runs the other way, through anger, flight, the belly of a fish, and a single sentence of surrender spoken in three layers of darkness. The Quran holds both halves together: a prophet who briefly despaired of his people, and a people who proved that despair wrong.",
    tr: "Yunus, Kur'an'da aynı anda iki şeyle hatırlanır: Allah kendisine emretmeden önce halkını terk etmesi ve azabın yaklaştığını görüp iman eden, bu sayede bağışlanan tek peygamberin halkına sahip olması. Kendi hikâyesi ise tam tersi bir yönde ilerler: öfke, kaçış, bir balığın karnı ve üç kat karanlıkta söylenen tek bir teslimiyet cümlesi. Kur'an bu iki yarıyı bir arada tutar: halkından kısa süreliğine umudunu kesen bir peygamber ve bu umutsuzluğu yanlışlayan bir halk.",
    az: "Yunus Quranda eyni anda iki şeylə xatırlanır: Allah ona əmr etmədən əvvəl xalqını tərk etməsi və əzabın yaxınlaşdığını görüb iman gətirən, bu səbəbdən bağışlanan yeganə peyğəmbərin xalqına sahib olması. Onun öz hekayəsi isə tam əks istiqamətdə irəliləyir: qəzəb, qaçış, bir balığın qarnı və üç qat qaranlıqda söylənən tək bir təslimiyyət cümləsi. Quran bu iki yarını bir arada saxlayır: xalqından qısa müddətə ümidini kəsən bir peyğəmbər və bu ümidsizliyi yanlış çıxaran bir xalq.",
    ru: "Юнус запомнился в Коране сразу двумя вещами: он покинул свой народ до того, как Бог повелел ему это, и при этом стал тем единственным пророком, чей народ уверовал, увидев приближение наказания, — и был за это пощажён. Его собственная история движется в обратную сторону: гнев, бегство, чрево рыбы и единственная фраза покорности, произнесённая в трёх слоях тьмы. Коран удерживает обе половины вместе: пророка, на миг отчаявшегося в своём народе, и народ, доказавший, что это отчаяние было напрасным.",
  },
  primarySurahs: [37, 21, 10, 68],
  chapters: [
    {
      id: "the-laden-ship",
      title: {
        en: "He went off in anger",
        tr: "Öfkeyle çekip gitti",
        az: "Qəzəblə çıxıb getdi",
        ru: "Он ушёл в гневе",
      },
      narrative: {
        en: "Yunus was one of the messengers, yet the Quran records a moment where he ran away — leaving his people to board a laden ship, going off in anger and, the text says, thinking that God would not decree anything upon him for it. The ship's crew, facing some difficulty, cast lots to decide who among them must go overboard; Yunus drew the lot and was among the losers.",
        tr: "Yunus, elçilerden biriydi; yine de Kur'an, onun bir an için kaçıp gittiğini kaydeder — halkını bırakıp yüklü bir gemiye biner, öfkeyle çekip gider ve metnin belirttiğine göre, bu yüzden Allah'ın kendisine bir şey takdir etmeyeceğini düşünür. Gemi mürettebatı bir zorlukla karşılaşınca, içlerinden kimin denize atılacağına kur'a çekerek karar verirler; kur'a Yunus'a çıkar ve o, kaybedenlerden olur.",
        az: "Yunus elçilərdən biri idi; buna baxmayaraq, Quran onun bir an üçün qaçıb getdiyini qeyd edir — xalqını tərk edib yüklü bir gəmiyə minir, qəzəblə çıxıb gedir və mətnin bildirdiyinə görə, bu səbəbdən Allahın ona heç nə təqdir etməyəcəyini düşünür. Gəminin heyəti bir çətinliklə üzləşəndə, aralarından kimin dənizə atılacağına püşk ataraq qərar verirlər; püşk Yunusa düşür və o, uduzanlardan olur.",
        ru: "Юнус был одним из посланников, и всё же Коран запечатлел момент, когда он бежал — оставил свой народ, взошёл на нагруженный корабль, ушёл в гневе и, как говорит текст, думал, что Бог ничего не предопределит ему за это. Экипаж корабля, столкнувшись с какой-то бедой, бросил жребий, чтобы решить, кому из них придётся оказаться за бортом; жребий пал на Юнуса, и он оказался среди проигравших.",
      },
      verseRefs: ["21:87", "37:139", "37:140", "37:141"],
    },
    {
      id: "in-the-three-darknesses",
      title: {
        en: "There is no deity except You",
        tr: "Senden başka ilah yoktur",
        az: "Səndən başqa ilah yoxdur",
        ru: "Нет божества, кроме Тебя",
      },
      narrative: {
        en: 'A fish swallowed him while he was, the Quran says, blameworthy for having fled. Had he not been one who exalted God, he would have remained in its belly until the Day of Resurrection. In the compounded darkness of the sea, the night, and the fish\'s belly, he called out: "There is no deity except You; exalted are You. Indeed, I have been of the wrongdoers." God responded to him and saved him from the distress — and the Quran adds, as a general promise, that this is how He saves the believers. Elsewhere the Quran addresses Muhammad ﷺ directly, telling him to be patient and not to be like the companion of the fish, who called out while distressed — and notes that had a mercy from his Lord not reached him, he would have been thrown onto the bare shore in blame. Instead, his Lord chose him and made him one of the righteous.',
        tr: "Bir balık onu yutar; Kur'an, kaçtığı için kınanmaya müstahak olduğunu belirtir. Eğer Allah'ı tesbih edenlerden olmasaydı, kıyamet gününe kadar onun karnında kalırdı. Denizin, gecenin ve balığın karnının iç içe geçmiş karanlığında şöyle seslenir: \"Senden başka ilah yoktur; sen yücesin. Gerçekten ben zalimlerden oldum.\" Allah ona icabet eder ve onu sıkıntıdan kurtarır — Kur'an, genel bir vaat olarak, iman edenleri işte böyle kurtardığını ekler. Başka bir yerde Kur'an, doğrudan Muhammed ﷺ'e hitap ederek sabretmesini ve sıkıntı içindeyken seslenen balık sahibi gibi olmamasını söyler — ve eğer Rabbinden bir rahmet kendisine ulaşmasaydı, kınanmış bir halde çıplak sahile atılacağını belirtir. Bunun yerine Rabbi onu seçer ve salihlerden kılar.",
        az: 'Bir balıq onu udur; Quran, qaçdığı üçün qınanmağa layiq olduğunu bildirir. Əgər Allahı təsbih edənlərdən olmasaydı, qiyamət gününə qədər onun qarnında qalardı. Dənizin, gecənin və balığın qarnının iç-içə keçmiş qaranlığında belə səslənir: "Səndən başqa ilah yoxdur; Sən pak və uzaqsan. Həqiqətən mən zalimlərdən oldum." Allah ona cavab verir və onu sıxıntıdan qurtarır — Quran, ümumi bir vəd olaraq, möminləri məhz belə qurtardığını əlavə edir. Başqa bir yerdə Quran birbaşa Məhəmməd ﷺ-ə müraciət edərək səbir etməsini və sıxıntı içində olarkən səslənən balıq sahibi kimi olmamasını söyləyir — və əgər Rəbbindən bir mərhəmət ona çatmasaydı, qınanmış halda çılpaq sahilə atılacağını bildirir. Bunun əvəzinə Rəbbi onu seçir və salehlərdən edir.',
        ru: "Рыба проглотила его, а он, как говорит Коран, заслуживал порицания за то, что бежал. Если бы он не был одним из тех, кто прославляет Бога, он остался бы в её чреве до Дня воскресения. В сгущённой тьме моря, ночи и чрева рыбы он воззвал: «Нет божества, кроме Тебя; пречист Ты. Поистине, я был из числа несправедливых». Бог ответил ему и спас его от беды — и Коран добавляет, как общее обещание, что именно так Он спасает верующих. В другом месте Коран напрямую обращается к Мухаммаду ﷺ, говоря ему быть терпеливым и не уподобляться спутнику рыбы, который воззвал, находясь в беде, — и отмечает, что если бы милость от его Господа не настигла его, он был бы выброшен на голый берег порицаемым. Вместо этого его Господь избрал его и сделал одним из праведных.",
      },
      verseRefs: ["37:142", "37:143", "37:144", "21:87", "21:88", "68:48", "68:49", "68:50"],
    },
    {
      id: "the-open-shore",
      title: {
        en: "Thrown onto the open shore",
        tr: "Açık sahile bırakılış",
        az: "Açıq sahilə atılma",
        ru: "Выброшен на открытый берег",
      },
      narrative: {
        en: "God threw him onto the open shore while he was ill, and caused a gourd vine to grow over him — a small, deliberate mercy of shade after everything he had been through.",
        tr: "Allah, hasta bir halde onu açık sahile bırakır ve üzerine bir kabak asması bitirir — yaşadığı her şeyden sonra ona verilen küçük, özenle seçilmiş bir gölge lütfu.",
        az: "Allah onu xəstə halda açıq sahilə atır və üzərinə bir balqabaq tənəyi bitirir — yaşadığı hər şeydən sonra ona verilən kiçik, xüsusi seçilmiş bir kölgə lütfü.",
        ru: "Бог выбросил его больным на открытый берег и взрастил над ним тыквенную лозу — небольшую, продуманную милость тени после всего пережитого.",
      },
      verseRefs: ["37:145", "37:146"],
    },
    {
      id: "the-one-city-that-believed",
      title: {
        en: "The one city whose faith benefited it",
        tr: "İmanının fayda verdiği tek şehir",
        az: "İmanının fayda verdiyi tək şəhər",
        ru: "Единственный город, чья вера принесла пользу",
      },
      narrative: {
        en: "God then sent him to a hundred thousand people or more, and this time they believed, and were granted enjoyment of life for a time. Elsewhere the Quran asks, pointedly, whether there has ever been a city that believed and had its faith benefit it, except the people of Yunus — when they believed, God removed from them the punishment of disgrace in this world and let them live. Among all the peoples the Quran describes rejecting their prophets until punishment arrived, this is the one exception: a people who believed in time.",
        tr: "Allah daha sonra onu yüz bin veya daha fazla kişiye gönderir; bu kez iman ederler ve bir süre için hayattan yararlanma bağışlanır. Başka bir yerde Kur'an, dikkat çekici bir şekilde, Yunus'un halkı dışında iman edip de bu imanın kendisine fayda verdiği bir şehir olup olmadığını sorar — iman ettiklerinde Allah, dünya hayatındaki rezillik azabını onlardan kaldırır ve yaşamalarına izin verir. Kur'an'ın azap gelene kadar peygamberlerini reddettiğini anlattığı tüm halklar arasında, bu tek istisnadır: tam vaktinde iman eden bir halk.",
        az: "Allah daha sonra onu yüz min və ya daha çox insana göndərir; bu dəfə iman gətirirlər və bir müddət həyatdan faydalanmaları bağışlanır. Başqa bir yerdə Quran diqqətçəkici şəkildə soruşur: Yunusun xalqından başqa, iman gətirib bu imanın ona fayda verdiyi bir şəhər olubmu — iman gətirdiklərində Allah dünya həyatındakı rüsvayçılıq əzabını onlardan qaldırır və yaşamalarına icazə verir. Quranın əzab gələnə qədər peyğəmbərlərini rədd etdiyini təsvir etdiyi bütün xalqlar arasında, bu yeganə istisnadır: tam vaxtında iman gətirən bir xalq.",
        ru: "Затем Бог послал его к ста тысячам людей или более, и на этот раз они уверовали, и им было дано пользоваться жизнью какое-то время. В другом месте Коран задаёт пронзительный вопрос: был ли хоть один город, который уверовал бы, и эта вера пошла бы ему на пользу, кроме народа Юнуса — когда они уверовали, Бог отвёл от них наказание позора в этой жизни и позволил им жить дальше. Среди всех народов, которые, по описанию Корана, отвергали своих пророков вплоть до прихода наказания, это единственное исключение: народ, уверовавший вовремя.",
      },
      verseRefs: ["37:147", "37:148", "10:98"],
    },
  ],
  themes: ["anger", "repentance", "mercy", "the-only-city-that-believed"],
  relatedNames: ["at-tawwab", "ar-rahim"],
};
