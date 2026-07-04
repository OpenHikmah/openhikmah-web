// Hafs/Uthmani standard ayah counts per surah (114 surahs, 6236 total)
const SURAH_LENGTHS: number[] = [
  7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52, 99, 128, 111, 110, 98, 135, 112,
  78, 118, 64, 77, 227, 93, 88, 69, 60, 34, 30, 73, 54, 45, 83, 182, 88, 75, 85, 54, 53, 89, 59, 37,
  35, 38, 29, 18, 45, 60, 49, 62, 55, 78, 96, 29, 22, 24, 13, 14, 11, 11, 18, 12, 12, 30, 52, 52,
  44, 28, 28, 20, 56, 40, 31, 50, 40, 46, 42, 29, 19, 36, 25, 22, 17, 19, 26, 30, 20, 15, 21, 11, 8,
  8, 19, 5, 8, 8, 11, 11, 8, 3, 9, 5, 4, 7, 3, 6, 3, 5, 4, 5, 6,
];

// Cumulative starts: SURAH_STARTS[i] = number of ayahs before surah (i+1)
const SURAH_STARTS: number[] = [];
let _acc = 0;
for (const len of SURAH_LENGTHS) {
  SURAH_STARTS.push(_acc);
  _acc += len;
}

/** Returns the 1-indexed global ayah number (used by audio CDN URLs). */
export function getGlobalAyahNumber(surah: number, ayah: number): number {
  if (surah < 1 || surah > 114) return 1;
  return SURAH_STARTS[surah - 1] + ayah;
}

/** Al-Afasy 128kbps MP3 from the Islamic Network CDN. */
export function getAudioUrl(surah: number, ayah: number): string {
  return `https://cdn.islamic.network/quran/audio/128/ar.alafasy/${getGlobalAyahNumber(surah, ayah)}.mp3`;
}
