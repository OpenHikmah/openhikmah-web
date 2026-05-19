# Open Hikmah

[![CI](https://github.com/Nazm-AI/open-hikmah/actions/workflows/ci.yml/badge.svg)](https://github.com/Nazm-AI/open-hikmah/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Contributor Covenant](https://img.shields.io/badge/Contributor%20Covenant-2.1-4baaaa.svg)](CODE_OF_CONDUCT.md)

A theological sensemaking tool for the Quran. Instead of reading linearly, you build a knowledge graph — verses connected by theme, shared Arabic root words, or contrasting concepts. Start from any verse or topic, expand outward, and watch the Quran's internal architecture emerge.

**Live:** [openhikmah.com](https://openhikmah.com)

---

## Features

- **Semantic Explorer** — Infinite canvas where verse nodes connect via AI-generated edges (thematic, root word, contrast). Click any node to read the full verse. Click any edge to see the theological reason for the connection.
- **AI Connections** — Claude (`claude-opus-4-7`) finds three related verses for each expansion, grounded in the Maturidi/Hanafi tradition with strict Tanzih framing.
- **Verse Search** — Direct ref lookup (`2:255`) or semantic text search. Results appear as preview cards with a single "Map Connections" action.
- **Bookmarks** — Save verses to your Quran Foundation account. Syncs across devices via the Quran Foundation User API (OAuth2 PKCE).
- **Divine Names** — All 99 Asmaul Husna with Maturidi taxonomy (Sifat al-Dhat · Sifat al-Ma'ani · Sifat al-Af'al), root morphology, and Claude-powered verse feeds.

---

## Tech Stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 16 (App Router), React 19, TypeScript |
| Canvas | @xyflow/react v12 |
| State | Zustand v5 |
| Styling | Tailwind CSS v4, Framer Motion |
| AI | Anthropic SDK — `claude-opus-4-7` with adaptive thinking |
| Quran data | alquran.cloud (verse text), api.quran.com (search) |
| User data | Quran Foundation User API (OAuth2 PKCE — bookmarks) |
| Testing | Vitest, Testing Library, jsdom |
| CI | GitHub Actions |

---

## Local Development

**1. Clone and install**

```bash
git clone https://github.com/Nazm-AI/open-hikmah
cd open-hikmah
npm install
```

**2. Set up environment**

```bash
cp .env.example .env.local
# Fill in all values in .env.local — see comments for where to get each one
```

**3. Run**

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Environment Variables

See [`.env.example`](.env.example) for the full list with descriptions. Required variables:

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Anthropic API key for verse connections and divine name verse feeds |
| `QF_CLIENT_SECRET` | Quran Foundation OAuth2 client secret |
| `QF_API_BASE` | Quran Foundation API base URL |
| `QF_AUTH_BASE` | Quran Foundation auth server URL |
| `NEXT_PUBLIC_QF_CLIENT_ID` | OAuth2 client ID (public) |
| `NEXT_PUBLIC_QF_AUTH_BASE` | Auth server URL (public, for PKCE redirect) |
| `NEXT_PUBLIC_APP_URL` | Your deployment URL (used in OAuth redirect URI) |

---

## Testing

```bash
npm run test        # watch mode
npm run test:ci     # single run (used in CI)
```

Tests live in `__tests__/` and cover:

| Directory | What's tested |
|-----------|--------------|
| `__tests__/lib/` | `surah-names`, `divine-names`, `pkce` — pure function unit tests |
| `__tests__/api/` | All API route handlers — input validation, error paths, response shape |
| `__tests__/store/` | Zustand canvas and auth stores — state transitions, optimistic updates, rollback |

External HTTP calls (`fetch`) and the Anthropic SDK are mocked so tests run instantly with no network access and no API costs.

---

## Project Structure

```
app/
  api/
    connections/          # POST — Claude AI finds related verses
    search/               # GET  — Verse search (ref or text)
    verse/                # GET  — Single verse fetch
    bookmarks/            # GET/POST/DELETE — Quran Foundation User API
    auth/exchange/        # POST — OAuth2 PKCE token exchange
    names/                # GET  — All 99 divine names
    names/[slug]/verses/  # GET  — Claude-generated verse feed per name
  callback/               # OAuth2 redirect landing page
  names/                  # /names grid page + /names/[slug] detail page
components/
  canvas/                 # React Flow nodes, edges, expand menu
  layout/                 # Header, context sidebar
  search/                 # Search dialog
lib/
  pkce.ts                 # PKCE auth URL builder
  surah-names.ts          # Shared surah name lookup
  divine-names.ts         # 99 Asmaul Husna data with Maturidi taxonomy
store/
  canvas.ts               # Verse graph state (Zustand)
  auth.ts                 # Auth + bookmarks state (Zustand + persist)
types/
  quran.ts                # Shared TypeScript types
__tests__/
  lib/                    # Unit tests for lib/
  api/                    # Route handler tests
  store/                  # Store tests
.github/
  workflows/ci.yml        # GitHub Actions CI pipeline
  PULL_REQUEST_TEMPLATE.md
  ISSUE_TEMPLATE/
```

---

## Deployment

The app is deployed on Vercel with a custom domain.

**Deploy your own:**

1. Push to GitHub and import the repo at [vercel.com/new](https://vercel.com/new)
2. Add all environment variables from `.env.example` in Vercel's project settings
3. Under **Domains**, add your custom domain and follow the DNS instructions
4. Register `https://yourdomain.com/callback` as a redirect URI with Quran Foundation

---

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a PR. The short version:

- Branch off `main`, use `feat/`, `fix/`, `docs/`, or `chore/` prefixes
- Run `npm run lint && npx tsc --noEmit && npm run test:ci` locally before pushing
- Use conventional commit messages
- Theological changes (prompts, divine name data, verse framing) require extra care — see the [Theological Standards](CONTRIBUTING.md#theological-standards) section

## Security

Report vulnerabilities privately to **security@openhikmah.com**. See [SECURITY.md](SECURITY.md).

## Code of Conduct

This project follows the [Contributor Covenant 2.1](CODE_OF_CONDUCT.md).

## License

[MIT](LICENSE)
