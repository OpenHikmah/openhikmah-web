/**
 * One-time (resumable) embedding of the local Quran corpus into the
 * `verse_embeddings` table, for semantic search + grounded thematic/contrast
 * discovery. Reads verses from Postgres, embeds each translation via Gemini, and
 * upserts the vector. Idempotent and resumable: verses already embedded with the
 * current model are skipped, so re-running only fills gaps.
 *
 *   DATABASE_URL=... GEMINI_API_KEY=... node scripts/embed-corpus.mjs
 *
 * Embeddings are always Gemini (Anthropic has none) regardless of AI_PROVIDER.
 */
import postgres from "postgres";
import { GoogleGenerativeAI } from "@google/generative-ai";

const EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL ?? "text-embedding-004";
const BATCH = 100; // Gemini batchEmbedContents caps at 100 requests per call.

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
if (!process.env.GEMINI_API_KEY) {
  console.error("GEMINI_API_KEY is not set (required to embed the corpus)");
  process.exit(1);
}

const model = new GoogleGenerativeAI(process.env.GEMINI_API_KEY).getGenerativeModel({
  model: EMBEDDING_MODEL,
});

async function embedBatch(texts) {
  const { embeddings } = await model.batchEmbedContents({
    requests: texts.map((text) => ({ content: { role: "user", parts: [{ text }] } })),
  });
  return embeddings.map((e) => e.values);
}

const sql = postgres(process.env.DATABASE_URL, { max: 1 });

try {
  // Resume: only embed verses missing an embedding for the current model.
  const pending = await sql`
    SELECT v.ref, v.translation
    FROM verses v
    LEFT JOIN verse_embeddings e
      ON e.ref = v.ref AND e.model = ${EMBEDDING_MODEL}
    WHERE e.ref IS NULL
    ORDER BY v.surah, v.ayah
  `;

  console.log(`${pending.length} verses to embed with ${EMBEDDING_MODEL}.`);
  if (pending.length === 0) {
    console.log("Nothing to do — corpus already embedded.");
  }

  let done = 0;
  for (let i = 0; i < pending.length; i += BATCH) {
    const batch = pending.slice(i, i + BATCH);
    const vectors = await embedBatch(batch.map((r) => r.translation));

    for (let j = 0; j < batch.length; j++) {
      const vec = `[${vectors[j].join(",")}]`;
      await sql`
        INSERT INTO verse_embeddings (ref, embedding, model)
        VALUES (${batch[j].ref}, ${vec}::vector, ${EMBEDDING_MODEL})
        ON CONFLICT (ref) DO UPDATE SET
          embedding = EXCLUDED.embedding,
          model = EXCLUDED.model
      `;
    }

    done += batch.length;
    console.log(`Embedded ${done}/${pending.length}`);
  }

  const [{ count }] = await sql`SELECT count(*)::int AS count FROM verse_embeddings`;
  console.log(`Done. verse_embeddings table now holds ${count} rows.`);
} finally {
  await sql.end();
}
