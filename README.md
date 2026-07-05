<h1 align="center">
  <img src="public/logo-mark.png" alt="Open Hikmah logo" height="48" align="center" />
  &nbsp;Open Hikmah
</h1>

<p align="center">
  An AI-grounded Quran knowledge graph — search a verse, drop it on an infinite canvas,
  and let AI surface the real connections between verses.
</p>

<p align="center">
  <a href="https://github.com/OpenHikmah/openhikmah-web/actions/workflows/ci.yml">
    <img src="https://github.com/OpenHikmah/openhikmah-web/actions/workflows/ci.yml/badge.svg" alt="CI" />
  </a>
  <a href="LICENSE">
    <img src="https://img.shields.io/badge/License-GPL--3.0-blue.svg" alt="License: GPL-3.0" />
  </a>
</p>

<p align="center">
  <strong><a href="https://openhikmah.com">Try it live →</a></strong>
</p>

---

## What is this?

Open Hikmah lets you explore the Qur'an the way ideas actually connect — not linearly, page by
page, but as a graph. Search for a verse, place it on the canvas, and expand it to see verses
that share a root word, a theme, or a meaningful contrast.

The connections themselves are **grounded, not hallucinated**: canonical data — shared Arabic
roots and embedding-based meaning similarity — finds the real candidate verses first. The AI's
only job is to explain _why_ a connection matters; it never invents a reference that isn't
actually there. Click any edge on the canvas to read that explanation.

Search directly by reference (`2:255`), by keyword, or **by meaning** — describe a concept in
your own words and find verses about it even if they don't share a single word with your query.

---

## Features

- **Canvas** — Infinite graph of verse nodes connected by AI-generated edges. Expand any verse by
  Theme, Root Word, or Contrast. Connections are grounded in real Arabic roots and embedding
  similarity — the AI only explains the reasoning, never the reference.
- **Search** — Direct reference lookup (`2:255`), full-text keyword search, or semantic
  **search by meaning**.
- **Find similar verses** — From any verse, surface the closest verses by meaning.
- **Shareable canvases** — Every canvas state serializes to a single URL you can copy and share.
- **Audio** — Play all canvas verses in Qur'an order with a single button.
- **99 Divine Names** — Full Asma'ul Husna with Arabic script, root morphology, taxonomy, verse
  feed, and contemplative reflections.
- **Bookmarks** — Save verses to your account; syncs across devices via the Quran Foundation API.
- **Social** — Daily engagement streaks, a friends leaderboard, and head-to-head challenges
  (24h / 48h / 7d).

---

## Getting Started

```bash
git clone https://github.com/OpenHikmah/openhikmah-web
cd openhikmah-web
bun install
cp .env.example .env.local
# fill in .env.local — see the comments in .env.example for what each value needs
bun run dev
```

Open [http://localhost:3000](http://localhost:3000).

At minimum you'll need `ANTHROPIC_API_KEY` to test AI connections; the Quran Foundation OAuth
variables are only required to test sign-in, bookmarks, and social features.

For the full contributor setup (running tests, Docker requirement for pushing, commit
conventions), see [CONTRIBUTING.md](CONTRIBUTING.md).

---

## Tech Stack

| Layer      | Choice                                                                                           |
| ---------- | ------------------------------------------------------------------------------------------------ |
| Framework  | Next.js 16 (App Router), React 19, TypeScript                                                    |
| Canvas     | @xyflow/react                                                                                    |
| State      | Zustand                                                                                          |
| Styling    | Tailwind CSS v4                                                                                  |
| AI         | Anthropic Claude (adaptive thinking) with Gemini fallback; Gemini embeddings for semantic search |
| Quran data | alquran.cloud + Quran Foundation API; canonical morphology for root grounding                    |
| Auth       | Quran Foundation OAuth2 PKCE                                                                     |
| Database   | PostgreSQL + pgvector + Drizzle ORM                                                              |
| Testing    | Vitest, Playwright                                                                               |
| CI         | GitHub Actions                                                                                   |

---

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a PR. The project touches sacred content —
theological changes (AI prompts, divine name data, verse framing) have extra requirements detailed
in [Theological Standards](CONTRIBUTING.md#theological-standards).

## Security

Report vulnerabilities privately to **security@openhikmah.com**. See [SECURITY.md](SECURITY.md).

## License

[GPL-3.0](LICENSE)

---

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=OpenHikmah/openhikmah-web&type=Date)](https://www.star-history.com/#OpenHikmah/openhikmah-web&Date)
