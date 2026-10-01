import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");
const OPENING_TAG_WITH_FONT_ARABIC = /<([A-Za-z][A-Za-z0-9]*)(\s[^<>]*?font-arabic[^<>]*?)\/?>/g;

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return tsxFiles(full);
    return full.endsWith(".tsx") ? [full] : [];
  });
}

describe("Arabic text markup", () => {
  it('sets lang="ar" and dir="rtl" on every font-arabic element', () => {
    const offenders: string[] = [];
    let checked = 0;

    for (const file of [...tsxFiles(join(ROOT, "app")), ...tsxFiles(join(ROOT, "components"))]) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(OPENING_TAG_WITH_FONT_ARABIC)) {
        checked += 1;
        const attrs = match[2];
        if (!/\slang="ar"/.test(attrs) || !/\sdir="rtl"/.test(attrs)) {
          offenders.push(`${relative(ROOT, file)}: <${match[1]}>`);
        }
      }
    }

    expect(checked).toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });
});
