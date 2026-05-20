# Open Hikmah

[![CI](https://github.com/Nazm-AI/open-hikmah/actions/workflows/ci.yml/badge.svg)](https://github.com/Nazm-AI/open-hikmah/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

An AI-powered Quran knowledge graph. Search any verse, drop it on an infinite canvas, and let AI surface the connections — shared root words, thematic resonance, theological contrast. The Quran's internal architecture emerges as you explore.

**Live:** [openhikmah.com](https://openhikmah.com)

---

## Features

- **Canvas** — Infinite graph of verse nodes connected by AI-generated edges. Expand any verse by Theme, Root Word, or Contrast. Click an edge to read the reasoning behind the connection.
- **Search** — Direct reference lookup (`2:255`) or full-text keyword search. One click adds any verse to the canvas.
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
| AI | Anthropic Claude (adaptive thinking) with Gemini fallback |
| Quran data | alquran.cloud + Quran Foundation API |
| Auth | Quran Foundation OAuth2 PKCE |
| Database | PostgreSQL + Drizzle ORM |
| Testing | Vitest |
| CI | GitHub Actions |

---

## Local Development

**Prerequisites:** Node 20+, PostgreSQL 16.

```bash
git clone https://github.com/Nazm-AI/open-hikmah
cd open-hikmah
npm install
cp .env.example .env.local
# Fill in the values
npx drizzle-kit migrate
npm run dev
```

Start a local Postgres instance if you don't have one:

```bash
docker run -d --name openh-db \
  -e POSTGRES_DB=open_hikmah \
  -e POSTGRES_USER=openh \
  -e POSTGRES_PASSWORD=devpassword \
  -p 5432:5432 \
  postgres:16-alpine
```

Then set `DATABASE_URL=postgresql://openh:devpassword@localhost:5432/open_hikmah` in `.env.local`.

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
