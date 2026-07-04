/**
 * Seed the `word_morphology` table from committed canonical data files, so
 * "By Root" connections are discovered from real Arabic roots instead of the
 * model's memory (see lib/connection-discovery.ts).
 *
 *   DATABASE_URL=... node scripts/seed-morphology.mjs
 *
 * Source data lives in data/morphology/*.jsonl — one verse per line:
 *   {"ref":"1:1","words":[{"position":1,"surface":"…","root":"سمو","lemma":"اسْم"}, …]}
 *
 * These files are generated from the canonical Quran morphology server
 * (fetch_word_morphology); only root-bearing words are stored. The loader is
 * idempotent: re-running upserts by (ref, position). Coverage is whatever is
 * present in data/morphology/ — verses without rows simply fall back to legacy
 * generation at request time.
 */
import postgres from "postgres";
import { readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const dataDir = join(dirname(fileURLToPath(import.meta.url)), "../data/morphology");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

function parseFile(text) {
  const rows = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const { ref, words } = JSON.parse(trimmed);
    for (const w of words ?? []) {
      if (!w.root) continue; // root discovery only needs root-bearing words
      rows.push({
        ref,
        position: w.position,
        surface: w.surface ?? "",
        root: w.root,
        lemma: w.lemma ?? null,
      });
    }
  }
  return rows;
}

const sql = postgres(process.env.DATABASE_URL, { max: 1 });

try {
  let files;
  try {
    files = (await readdir(dataDir)).filter((f) => f.endsWith(".jsonl")).sort();
  } catch {
    console.error(`No morphology data directory at ${dataDir}`);
    process.exit(1);
  }

  if (files.length === 0) {
    console.warn("No .jsonl morphology files found — nothing to seed.");
  }

  let total = 0;
  for (const file of files) {
    const rows = parseFile(await readFile(join(dataDir, file), "utf8"));
    const BATCH = 500;
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      await sql`
        INSERT INTO word_morphology ${sql(batch, "ref", "position", "surface", "root", "lemma")}
        ON CONFLICT (ref, position) DO UPDATE SET
          surface = EXCLUDED.surface,
          root = EXCLUDED.root,
          lemma = EXCLUDED.lemma
      `;
    }
    total += rows.length;
    console.log(`${file}: upserted ${rows.length} root-bearing words`);
  }

  const [{ count }] = await sql`SELECT count(*)::int AS count FROM word_morphology`;
  const [{ verses }] = await sql`SELECT count(distinct ref)::int AS verses FROM word_morphology`;
  console.log(
    `Done. word_morphology holds ${count} words across ${verses} verses (this run: ${total}).`
  );
} finally {
  await sql.end();
}
