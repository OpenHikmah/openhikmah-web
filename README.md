# Open Hikmah

[![CI](https://github.com/Nazm-AI/open-hikmah/actions/workflows/ci.yml/badge.svg)](https://github.com/Nazm-AI/open-hikmah/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

An AI-powered Quran knowledge graph. Search any verse, drop it on an infinite canvas, and let AI surface the connections — shared root words, thematic resonance, theological contrast. The Quran's internal architecture emerges as you explore.

**Live:** [openhikmah.com](https://openhikmah.com)

---

## Features

- **Canvas** — Infinite graph of verse nodes connected by AI-generated edges. Expand any verse by Theme, Root Word, or Contrast. Click an edge to read the reasoning behind the connection. Connections are **grounded**: canonical data (Arabic roots + meaning-based similarity) discovers the real target verses; the AI only explains *why* — it never invents references.
- **Search** — Direct reference lookup (`2:255`), full-text keyword search, or **search by meaning** (semantic): find verses about a concept even when they don't contain the literal word. One click adds any verse to the canvas.
- **Find similar verses** — From any verse, surface the closest verses by meaning (embedding similarity).
- **Shareable canvases** — Every canvas state serialises to a single URL you can copy and share.
- **Audio** — Play all canvas verses in Quran order with a single button.
- **99 Divine Names** — Full Asmaul Husna with Arabic script, root morphology, Maturidi taxonomy, verse feed, and contemplative reflections.
- **Bookmarks** — Save verses to your account; syncs across devices via the Quran Foundation API.
- **Social** — Daily engagement streaks, a friends leaderboard, and head-to-head challenges (24h / 48h / 7d).

---

## Tech Stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 16 (App Router), React 19, TypeScript |
| Canvas | @xyflow/react |
| State | Zustand |
| Styling | Tailwind CSS v4 |
| AI | Anthropic Claude (adaptive thinking) with Gemini fallback; Gemini embeddings for semantic search |
| Quran data | alquran.cloud + Quran Foundation API; canonical morphology for root grounding |
| Auth | Quran Foundation OAuth2 PKCE |
| Database | PostgreSQL + pgvector + Drizzle ORM |
| Testing | Vitest |
| CI | GitHub Actions |

---

## Local Development

**Prerequisites:** Node 20+, PostgreSQL 16 with the **pgvector** extension.

```bash
git clone https://github.com/Nazm-AI/open-hikmah
cd open-hikmah
npm install
cp .env.example .env.local
# Fill in the values
npx drizzle-kit migrate          # creates tables; enables the pgvector extension

# One-time data seeds (idempotent, resumable):
node scripts/seed-quran.mjs       # full Quran corpus → verses
node scripts/embed-corpus.mjs     # verse embeddings → semantic search (needs GEMINI_API_KEY)
node scripts/seed-morphology.mjs  # Arabic roots → grounded "By Root" connections

npm run dev
```

Start a local Postgres instance if you don't have one (the image must include pgvector):

```bash
docker run -d --name openh-db \
  -e POSTGRES_DB=open_hikmah \
  -e POSTGRES_USER=openh \
  -e POSTGRES_PASSWORD=devpassword \
  -p 5432:5432 \
  pgvector/pgvector:pg16
```

Then set `DATABASE_URL=postgresql://openh:devpassword@localhost:5432/open_hikmah` in `.env.local`.

> **Note:** the app runs without the seeds — search falls back to keyword mode and connections
> to AI-from-memory generation. Run the seeds to enable semantic search and grounded connections.
> `seed-morphology.mjs` ships with Al-Fatihah (surah 1); the rest of the corpus is a one-time backfill.

---

## Testing

```bash
npm run test        # watch mode
npm run test:ci     # single run (used in CI)
```

All external calls (fetch, Anthropic SDK, database) are mocked — tests run with no network access or API costs.

---

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a PR. The project touches sacred content — theological changes (AI prompts, divine name data, verse framing) have extra requirements detailed in [Theological Standards](CONTRIBUTING.md#theological-standards).

## Security

Report vulnerabilities privately to **security@openhikmah.com**. See [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
