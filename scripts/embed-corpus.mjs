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

// gemini-embedding-001 is natively 3072-dim; we reduce to 768 via
// outputDimensionality to match the verse_embeddings vector(768) column. Must stay
// in sync with lib/ai/ai.ts (the runtime query embedder). Override the model via
// GEMINI_EMBEDDING_MODEL and the batch size via EMBED_BATCH if the API tightens.
const EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL ?? "gemini-embedding-001";
const OUTPUT_DIM = 768;
const BATCH = Number(process.env.EMBED_BATCH ?? 100);

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
if (!process.env.GEMINI_API_KEY) {
  console.error("GEMINI_API_KEY is not set (required to embed the corpus)");
  process.exit(1);
}

// Cap a single rate-limit wait. Per-minute (free-tier) 429s ask ~20-60s; a daily
// quota asks for far longer — beyond this we stop and let the user resume later
// (the run is idempotent).
const MAX_RATE_WAIT_S = 120;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function retryDelaySeconds(body) {
  const m = body.match(/"retryDelay":\s*"([\d.]+)s"/) || body.match(/retry in ([\d.]+)s/i);
  return m ? Math.ceil(parseFloat(m[1])) : 30;
}

// Returns the vectors, or null to signal "rate limited beyond the cap — stop and
// resume later". Retries on 429 honoring Google's suggested retryDelay so a single
// run self-paces under the free-tier per-minute quota.
async function embedBatch(texts) {
  for (;;) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:batchEmbedContents?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: texts.map((text) => ({
            model: `models/${EMBEDDING_MODEL}`,
            content: { parts: [{ text }] },
            outputDimensionality: OUTPUT_DIM,
          })),
        }),
      }
    );

    if (res.status === 429) {
      const wait = retryDelaySeconds(await res.text().catch(() => "")) + 2;
      if (wait > MAX_RATE_WAIT_S) return null;
      console.log(`Rate limited (429) — waiting ${wait}s before retrying…`);
      await sleep(wait * 1000);
      continue;
    }
    if (!res.ok) {
      throw new Error(
        `Embedding request failed: ${res.status} ${await res.text().catch(() => "")}`
      );
    }
    const data = await res.json();
    return (data.embeddings ?? []).map((e) => e.values);
  }
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

    if (vectors === null) {
      console.log(
        `Stopped at ${done}/${pending.length} — rate limit needs a long wait ` +
          `(likely a daily quota). Re-run later to resume (idempotent), or enable billing.`
      );
      break;
    }

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
