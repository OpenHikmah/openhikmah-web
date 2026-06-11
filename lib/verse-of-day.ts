import { resolveVerse } from "@/lib/verse-resolver";
import type { Verse } from "@/types/quran";

/**
 * Verse of the Day. Per the product decision: an admin-curated entry overrides
 * when present (future — see the Admin panel sub-plan), and this algorithmic pick
 * is the always-on fallback. Deterministic by UTC date over a curated pool of
 * well-known, contemplative verses, so the same verse shows all day and rotates
 * predictably without any backend curation.
 */

const POOL = [
  // Al-Fatiha
  "1:1", "1:2", "1:5", "1:7",
  // Al-Baqarah — faith, patience, mercy, supplication
  "2:152", "2:153", "2:155", "2:156", "2:177", "2:186",
  "2:255", "2:256", "2:261", "2:269", "2:285", "2:286",
  // Al-Imran — steadfastness, forgiveness
  "3:18", "3:102", "3:133", "3:159", "3:173", "3:200",
  // An-Nisa — justice
  "4:36",
  // Al-Maidah — justice, piety
  "5:8", "5:35",
  // Al-An'am — divine transcendence
  "6:103",
  // Al-A'raf — supplication, mercy
  "7:23", "7:156",
  // At-Tawbah — reliance on Allah
  "9:51", "9:129",
  // Yunus — allies of Allah
  "10:57", "10:62",
  // Yusuf — patience, hope
  "12:18", "12:86", "12:87",
  // Ar-Ra'd — hearts, remembrance
  "13:28",
  // Ibrahim — gratitude, good words
  "14:7", "14:24",
  // An-Nahl — gratitude, righteous life
  "16:18", "16:97",
  // Al-Isra — parents, prayer, knowledge
  "17:23", "17:44", "17:80",
  // Al-Kahf — mercy, striving, worldly life
  "18:10", "18:45",
  // Ta-Ha — prayer, knowledge
  "20:14", "20:114",
  // Al-Anbiya — La ilaha illa Anta
  "21:87",
  // Al-Mu'minun — success of believers
  "23:1",
  // An-Nur — Light verse
  "24:35", "24:41",
  // Al-Furqan — servants of the Most Merciful
  "25:63", "25:74",
  // An-Naml — answering the distressed
  "27:62",
  // Al-Ankabut — prayer, striving
  "29:45", "29:69",
  // Ar-Rum — signs, fitrah, spouses
  "30:21", "30:30",
  // Luqman — gratitude, enjoining good
  "31:12", "31:17",
  // Al-Ahzab — remembrance
  "33:41",
  // Ya-Sin — sovereignty
  "36:83",
  // Az-Zumar — knowledge, mercy
  "39:9", "39:53",
  // Ghafir — supplication, reliance
  "40:44", "40:60",
  // Fussilat — steadfastness
  "41:30",
  // Ash-Shura — nothing like Him
  "42:11",
  // Al-Hujurat — brotherhood, dignity
  "49:10", "49:13",
  // Qaf — closeness of Allah
  "50:16",
  // Adh-Dhariyat — purpose of creation
  "51:56",
  // Ar-Rahman — repeated blessing
  "55:1", "55:13", "55:26",
  // Al-Hadid — glorification, presence
  "57:1", "57:4",
  // Al-Mujadila — raising of ranks
  "58:11",
  // Al-Hashr — Divine Names
  "59:22", "59:23", "59:24",
  // At-Taghabun — trust, permission of Allah
  "64:11",
  // At-Talaq — sufficiency of Allah
  "65:3",
  // At-Tahrim — sincere repentance
  "66:8",
  // Al-Mulk — purpose of life, divine knowledge
  "67:2", "67:14",
  // Al-Insan — feeding the poor
  "76:8",
  // Al-Ala — the Hereafter
  "87:17",
  // Al-Fajr — soul at peace
  "89:27",
  // Ad-Duha — promise of satisfaction
  "93:5",
  // Al-Inshirah — ease with hardship
  "94:5", "94:6",
  // At-Tin — best of stature
  "95:4",
  // Al-Alaq — reading in the name of Allah
  "96:1",
  // Al-Qadr — Night of Decree
  "97:1",
  // Az-Zalzalah — weight of deeds
  "99:7", "99:8",
  // Al-Asr — time and salvation
  "103:1", "103:2", "103:3",
  // Al-Ikhlas — complete surah
  "112:1", "112:2", "112:3", "112:4",
] as const;

function daySeed(date: Date): number {
  const key = `${date.getUTCFullYear()}-${date.getUTCMonth() + 1}-${date.getUTCDate()}`;
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return hash;
}

/** The deterministic ref chosen for a given day. */
export function verseOfDayRef(date: Date = new Date()): string {
  return POOL[daySeed(date) % POOL.length];
}

/**
 * Admin-curated override for a given day. Returns null until the admin
 * Verse-of-the-Day calendar (roadmap Epic 2 / design.md §6.A) is built — the
 * algorithmic pick below is the always-on fallback. This is the single seam a
 * curated entry will plug into; the card UI is identical either way.
 */
export async function getCuratedVerseOfDay(_date: Date): Promise<Verse | null> {
  return null;
}

/** Resolves today's verse (full text). Null only if it can't be resolved at all. */
export async function getVerseOfDay(date: Date = new Date()): Promise<Verse | null> {
  const curated = await getCuratedVerseOfDay(date);
  if (curated) return curated;
  return resolveVerse(verseOfDayRef(date));
}
