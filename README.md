<h1>
  <img src="public/logo-mark.png" alt="Open Hikmah logo" height="32" align="center" />
  &nbsp;Open Hikmah
</h1>

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

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a PR. The project touches sacred content — theological changes (AI prompts, divine name data, verse framing) have extra requirements detailed in [Theological Standards](CONTRIBUTING.md#theological-standards).

## Security

Report vulnerabilities privately to **security@openhikmah.com**. See [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)

---

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=Nazm-AI/open-hikmah&type=Date)](https://www.star-history.com/#Nazm-AI/open-hikmah&Date)
