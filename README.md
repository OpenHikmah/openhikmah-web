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
  <a href="CODE_OF_CONDUCT.md">
    <img src="https://img.shields.io/badge/Contributor%20Covenant-2.1-4baaaa.svg" alt="Contributor Covenant" />
  </a>
  <a href="CONTRIBUTING.md">
    <img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg" alt="PRs Welcome" />
  </a>
  <br />
  <img src="https://img.shields.io/badge/TypeScript-strict-3178c6.svg?logo=typescript&logoColor=white" alt="TypeScript" />
  <a href="https://github.com/OpenHikmah/openhikmah-web/stargazers">
    <img src="https://img.shields.io/github/stars/OpenHikmah/openhikmah-web?style=flat&color=blue" alt="GitHub stars" />
  </a>
  <a href="https://github.com/OpenHikmah/openhikmah-web/issues">
    <img src="https://img.shields.io/github/issues/OpenHikmah/openhikmah-web" alt="Open issues" />
  </a>
</p>

<p align="center">
  <strong><a href="https://openhikmah.com">Try it live →</a></strong>
</p>

---

## Overview

Open Hikmah is an AI-grounded Quran knowledge graph. Rather than reading the Qur'an linearly,
page by page, it lets you explore verses as a connected graph: search for a verse, place it on
an infinite canvas, and expand it to surface related verses — by shared root word, by theme, or
by meaningful contrast.

Connections are **grounded, not hallucinated**: canonical data — shared Arabic roots and
embedding-based semantic similarity — identifies the candidate verses first. The AI's role is
limited to explaining _why_ a connection holds; it never invents a reference. Every edge on the
canvas links to that explanation.

Verses can be found by direct reference (`2:255`), by keyword, or **by meaning** — describing a
concept in your own words and retrieving verses about it even when no words are shared with the
query.

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
