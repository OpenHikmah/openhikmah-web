import type { Story } from "../types";

export const ADAM_STORY: Story = {
  slug: "adam",
  name: { en: "Adam", tr: "Adem", az: "Adəm", ru: "Адам" },
  arabicName: "آدم",
  tagline: {
    en: "The first human, taught the names of all things",
    tr: "İlk insan, kendisine tüm eşyanın isimleri öğretilen kişi",
    az: "Bütün əşyaların adları özünə öyrədilən ilk insan",
    ru: "Первый человек, которому были открыты имена всего сущего",
  },
  intro: {
    en: "Adam is honored in the Quran as the first human being and the first prophet — created to serve as a vicegerent on earth, taught knowledge no angel possessed, and, after a single act of heedlessness, the first to be forgiven through repentance. His story sets the pattern the Quran returns to again and again: creation, trial, and mercy.",
    tr: "Adem, Kur'an'da ilk insan ve ilk peygamber olarak onurlandırılır — yeryüzünde bir halife olarak yaratılmış, hiçbir meleğin sahip olmadığı bir bilgiyle donatılmış ve tek bir gaflet anının ardından tövbe yoluyla bağışlanan ilk kişi olmuştur. Onun kıssası, Kur'an'ın defalarca döndüğü örüntüyü belirler: yaratılış, imtihan ve rahmet.",
    az: "Adəm, Qurani-Kərimdə ilk insan və ilk peyğəmbər kimi şərəfləndirilir — yer üzündə xəlifə olmaq üçün yaradılmış, heç bir mələyin malik olmadığı bir elmlə öyrədilmiş və bir anlıq qəflətdən sonra tövbə vasitəsilə bağışlanan ilk şəxs olmuşdur. Onun qissəsi Quranın dəfələrlə qayıtdığı nümunəni müəyyən edir: yaradılış, sınaq və mərhəmət.",
    ru: "Адам почитается в Коране как первый человек и первый пророк — сотворённый, чтобы быть наместником на земле, наделённый знанием, которым не обладал ни один ангел, и, после единственного момента беспечности, первым, кто был прощён через покаяние. Его история задаёт образец, к которому Коран возвращается снова и снова: сотворение, испытание и милость.",
  },
  primarySurahs: [2, 7, 20],
  chapters: [
    {
      id: "the-vicegerent",
      title: {
        en: "A vicegerent on earth",
        tr: "Yeryüzünde bir halife",
        az: "Yer üzündə bir xəlifə",
        ru: "Наместник на земле",
      },
      narrative: {
        en: "When God tells the angels He is placing a vicegerent on earth, they ask why a being capable of corruption and bloodshed should be given this role, when they themselves glorify Him constantly. God answers that He knows what they do not. He then teaches Adam the names of all things — a knowledge the angels themselves lack when asked to recite it — and has Adam inform them of it. It is this capacity for knowledge, not mere existence, that the Quran presents as the basis for Adam's honor.",
        tr: "Allah meleklere yeryüzünde bir halife yaratacağını bildirdiğinde, melekler kendileri sürekli O'nu tesbih edip yüceltirken, bozgunculuk ve kan dökme kapasitesine sahip bir varlığa neden bu görevin verildiğini sorarlar. Allah, kendilerinin bilmediğini bildiğini söyler. Ardından Adem'e bütün eşyanın isimlerini öğretir — melekler bunları söylemeleri istendiğinde bu bilgiye sahip olmadıklarını görürler — ve Adem'e bunları meleklere bildirmesini sağlar. Kur'an'ın Adem'in onurunun temeli olarak sunduğu şey, sadece varoluş değil, bu bilgi kapasitesidir.",
        az: "Allah mələklərə yer üzündə bir xəlifə yaradacağını bildirdikdə, mələklər özləri daim Onu təsbih edib şəninə həmd etdikləri halda, fəsad törətmək və qan tökmək qabiliyyətinə malik bir varlığa nə üçün bu vəzifənin veriləcəyini soruşurlar. Allah onların bilmədiyini bildiyini bildirir. Sonra Adəmə bütün əşyaların adlarını öyrədir — mələklər bunları demələri istənildikdə bu biliyə malik olmadıqlarını göstərirlər — və Adəmə bunları mələklərə xəbər verməsini əmr edir. Quranın Adəmin şərəfinin əsası kimi təqdim etdiyi şey, sadəcə mövcudluq deyil, məhz bu bilik qabiliyyətidir.",
        ru: "Когда Бог сообщает ангелам, что помещает на земле наместника, они спрашивают, почему эта роль отдана существу, способному на нечестие и кровопролитие, тогда как сами они непрестанно прославляют Его. Бог отвечает, что знает то, чего не знают они. Затем Он обучает Адама именам всего сущего — знанием, которого недостаёт самим ангелам, когда их просят перечислить их, — и повелевает Адаму сообщить им об этом. Именно эта способность к знанию, а не само по себе существование, представлена Кораном как основание чести Адама.",
      },
      verseRefs: ["2:30", "2:31", "2:32", "2:33"],
    },
    {
      id: "the-refusal-of-iblis",
      title: {
        en: "The one who refused to bow",
        tr: "Secde etmeyi reddeden",
        az: "Səcdə etməkdən boyun qaçıran",
        ru: "Тот, кто отказался пасть ниц",
      },
      narrative: {
        en: "God commands the angels to prostrate before Adam, and they all do — except Iblis, who is of the jinn rather than one of the angels, and refuses out of arrogance, arguing he is superior because he was created from fire while Adam was created from clay. God expels him, but when Iblis asks for a reprieve until the Day of Resurrection, what he is granted is narrower — a reprieve until the appointed, well-known time, not the full span he requested — and he vows to waylay Adam's descendants from every direction. It is a warning placed at the very start of human history: enmity from Iblis is named explicitly, not left implicit.",
        tr: "Allah meleklere Adem'in önünde secde etmelerini emreder ve hepsi secde eder — meleklerden değil cinlerden olan İblis hariç; o, ateşten yaratıldığı için topraktan yaratılan Adem'den üstün olduğunu ileri sürerek kibirle secdeden kaçınır. Allah onu kovar; ancak İblis Kıyamet Günü'ne kadar mühlet istediğinde, kendisine verilen daha dardır — istediği sürenin tamamı değil, yalnızca belirli, bilinen bir vakte kadar bir mühlet — ve o da Adem'in soyunu her yönden pusuya düşüreceğine yemin eder. Bu, insanlık tarihinin en başına yerleştirilmiş bir uyarıdır: İblis'in düşmanlığı örtük bırakılmaz, açıkça adlandırılır.",
        az: "Allah mələklərə Adəmin qarşısında səcdə etmələrini əmr edir və hamısı səcdə edir — mələklərdən deyil, cinlərdən olan İblisdən başqa; o, oddan yaradıldığı üçün torpaqdan yaradılan Adəmdən üstün olduğunu iddia edərək təkəbbürlə səcdədən boyun qaçırır. Allah onu qovur; lakin İblis Qiyamət gününə qədər möhlət istədikdə, ona verilən daha darıdır — istədiyi müddətin tamamı deyil, yalnız müəyyən, məlum bir vaxta qədər bir möhlət — o da Adəmin nəslini hər tərəfdən pusquya salacağına and içir. Bu, bəşər tarixinin lap əvvəlinə qoyulmuş bir xəbərdarlıqdır: İblisin düşmənçiliyi gizli saxlanılmır, açıq şəkildə adlandırılır.",
        ru: "Бог повелевает ангелам пасть ниц перед Адамом, и все они повинуются — кроме Иблиса, который принадлежит не к ангелам, а к джиннам, и из гордыни отказывается, утверждая, что он превосходит Адама, поскольку сотворён из огня, тогда как Адам сотворён из глины. Бог изгоняет его; но когда Иблис просит об отсрочке до Дня Воскресения, ему предоставляется меньшее — отсрочка лишь до определённого, известного часа, а не весь испрошенный срок, — и он клянётся подстерегать потомков Адама со всех сторон. Это предостережение помещено в самое начало человеческой истории: вражда со стороны Иблиса названа прямо, а не оставлена подразумеваемой.",
      },
      verseRefs: ["2:34", "7:11", "7:12", "7:13", "7:14", "7:15", "7:16", "7:17", "7:18", "18:50"],
    },
    {
      id: "the-garden-and-return",
      title: {
        en: "The tree, the fall, and forgiveness",
        tr: "Ağaç, düşüş ve bağışlanma",
        az: "Ağac, süqut və bağışlanma",
        ru: "Дерево, падение и прощение",
      },
      narrative: {
        en: "Adam and his wife are settled in the Garden and permitted everything except one tree. Satan works on them through whispered suggestion until they eat from it, after which they immediately recognize their exposure and their error. Both turn to God at once, saying they have wronged themselves and asking for forgiveness and mercy — and are forgiven. They are then told to descend to the earth, which the Quran frames not as punishment alone but as the setting for the guidance that would follow, guidance whose acceptance would end all fear and grief.",
        tr: "Adem ve eşi Cennet'e yerleştirilir ve tek bir ağaç dışında her şeye izinli kılınırlar. Şeytan fısıltıyla telkinde bulunarak onları o ağaçtan yemeye sürükler; bunun ardından ikisi de hemen açıklıklarının ve hatalarının farkına varırlar. İkisi de derhal Allah'a yönelerek kendilerine zulmettiklerini söyler, bağışlanma ve rahmet dilerler — ve bağışlanırlar. Ardından yeryüzüne inmeleri emredilir; Kur'an bunu yalnızca bir ceza olarak değil, ardından gelecek olan ve kabulü her türlü korku ve üzüntüye son verecek hidayetin zemini olarak sunar.",
        az: "Adəm və zövcəsi Cənnətə yerləşdirilir və bir ağacdan başqa hər şeyə izin verilir. Şeytan pıçıltı ilə vəsvəsə edərək onları o ağacdan yeməyə sövq edir; bundan sonra hər ikisi dərhal açıqlıqlarının və səhvlərinin fərqinə varır. Hər ikisi dərhal Allaha üz tutaraq özlərinə zülm etdiklərini deyir, bağışlanma və mərhəmət diləyirlər — və bağışlanırlar. Sonra yer üzünə enmələri əmr olunur; Quran bunu təkcə cəza kimi deyil, ardınca gələcək və qəbulu hər cür qorxu və kədəri sona çatdıracaq hidayətin zəmini kimi təqdim edir.",
        ru: "Адам и его жена поселены в Раю, где им дозволено всё, кроме одного дерева. Шайтан искушает их шёпотом, пока они не вкушают от него, после чего оба тотчас осознают свою наготу и свою ошибку. Оба сразу же обращаются к Богу, говоря, что причинили несправедливость самим себе, и прося прощения и милости, — и получают прощение. Затем им велено сойти на землю, что Коран представляет не просто как наказание, а как условие для последующего руководства — руководства, принятие которого положит конец всякому страху и скорби.",
      },
      verseRefs: ["7:19", "7:20", "7:21", "7:22", "7:23", "7:24", "7:25", "2:37", "2:38"],
    },
  ],
  themes: ["creation", "repentance", "knowledge"],
  relatedNames: ["al-khaliq", "al-ghafur", "at-tawwab"],
};
