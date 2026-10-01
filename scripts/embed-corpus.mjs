/**
 * One-time (resumable) embedding of the local Quran corpus into the
 * `verse_embeddings` table, for semantic search + grounded thematic/contrast
 * discovery. Reads verses from Postgres, embeds each translation via Gemini, and
 * upserts the vector. Idempotent and resumable: verses already embedded with the
 * current model are skipped, so re-running only fills gaps.
 *
 *   DATABASE_URL=... GEMINI_API_KEY=... bun scripts/embed-corpus.mjs
 *
 * Embeddings are always Gemini (Anthropic has none) regardless of AI_PROVIDER.
 *
 * `--check` reports coverage (total verses vs. embedded for the current model)
 * without calling the embedding API — no GEMINI_API_KEY needed for this mode.
 *
 *   DATABASE_URL=... bun scripts/embed-corpus.mjs --check
 *
 * Bun-only: it imports the shared 429 classifier straight from
 * lib/ai/gemini-errors.ts (shipped next to this script in the prod image).
 */
import { pathToFileURL } from "node:url";
import postgres from "postgres";
import {
  classifyGeminiError,
  perMinuteBackoffMs,
  PER_MINUTE_MAX_RETRIES,
} from "../lib/ai/gemini-errors.ts";

// gemini-embedding-001 is natively 3072-dim; we reduce to 768 via
// outputDimensionality to match the verse_embeddings vector(768) column. Must stay
// in sync with lib/ai/ai.ts (the runtime query embedder). Override the model via
// GEMINI_EMBEDDING_MODEL and the batch size via EMBED_BATCH if the API tightens.
const EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL ?? "gemini-embedding-001";
const OUTPUT_DIM = 768;
const BATCH = Number(process.env.EMBED_BATCH ?? 100);
const CHECK_ONLY = process.argv.includes("--check");

// A hung request must fail the run rather than hold the admin job slot (and its
// advisory lock, released when this process exits) indefinitely.
const FETCH_TIMEOUT_MS = 60_000;
const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Returns the vectors, or null to signal "stop and resume later" (a daily quota,
// per-minute retries exhausted, or a malformed response). Per-minute 429s are
// waited out with the same backoff the app uses, at most PER_MINUTE_MAX_RETRIES
// times; any other non-2xx throws.
export async function embedBatch(texts, sleep = defaultSleep) {
  for (let attempt = 1; ; attempt++) {
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
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      }
    );

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const info = classifyGeminiError({ status: res.status, message: body });
      if (info.cls === "daily") {
        console.log(`Daily embedding quota exhausted (${info.quotaId ?? "429"}).`);
        return null;
      }
      if (info.cls !== "per-minute" && info.cls !== "other-429") {
        throw new Error(`Embedding request failed: ${res.status} ${body}`);
      }
      if (attempt > PER_MINUTE_MAX_RETRIES) {
        console.log(`Still rate limited (429) after ${PER_MINUTE_MAX_RETRIES} retries.`);
        return null;
      }
      const waitMs = perMinuteBackoffMs(attempt, info.retryAfterMs);
      console.log(`Rate limited (429) — waiting ${Math.ceil(waitMs / 1000)}s before retrying…`);
      await sleep(waitMs);
      continue;
    }
    const data = await res.json();
    const embeddings = data.embeddings ?? [];
    // A short/partial batch response (or a vector with the wrong dimension)
    // must stop the run cleanly, the same way a rate-limit cap does — not
    // crash mid-batch on `vectors[j].join(",")` with an opaque TypeError
    // (issue #567 C4). Mirrors embedViaRest's validation in lib/ai/ai.ts.
    if (embeddings.length !== texts.length) {
      console.log(
        `Embedding response missing embeddings: expected ${texts.length}, got ${embeddings.length}.`
      );
      return null;
    }
    for (let i = 0; i < embeddings.length; i++) {
      const values = embeddings[i]?.values;
      if (!values || values.length !== OUTPUT_DIM) {
        console.log(
          `Embedding ${i} has invalid shape: expected ${OUTPUT_DIM} dims, got ${values?.length ?? 0}.`
        );
        return null;
      }
    }
    return embeddings.map((e) => e.values);
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }
  if (!CHECK_ONLY && !process.env.GEMINI_API_KEY) {
    console.error("GEMINI_API_KEY is not set (required to embed the corpus)");
    process.exit(1);
  }

  const sql = postgres(process.env.DATABASE_URL, { max: 1 });

  try {
    if (CHECK_ONLY) {
      const [{ total }] = await sql`SELECT count(*)::int AS total FROM verses`;
      const [{ embedded }] = await sql`
        SELECT count(DISTINCT v.ref)::int AS embedded
        FROM verses v
        JOIN verse_embeddings e ON e.ref = v.ref
        WHERE e.model = ${EMBEDDING_MODEL}
      `;
      const missing = total - embedded;
      console.log(`Corpus: ${total} verses.`);
      console.log(`Embedded with ${EMBEDDING_MODEL}: ${embedded}/${total}.`);
      console.log(
        missing === 0
          ? "Coverage complete — every verse has a current-model embedding."
          : `Missing: ${missing} verse(s) — re-run without --check to fill the gap (resumable).`
      );
      process.exitCode = missing === 0 ? 0 : 1;
    } else {
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
          // embedBatch already logged the specific reason (daily quota,
          // per-minute retries exhausted, or a malformed response — #567 C4).
          console.log(`Stopped at ${done}/${pending.length}. Re-run later to resume (idempotent).`);
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
    }
  } finally {
    await sql.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
