# Open Hikmah

[![CI](https://github.com/Nazm-AI/open-hikmah/actions/workflows/ci.yml/badge.svg)](https://github.com/Nazm-AI/open-hikmah/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Contributor Covenant](https://img.shields.io/badge/Contributor%20Covenant-2.1-4baaaa.svg)](CODE_OF_CONDUCT.md)

A theological sensemaking tool for the Quran. Instead of reading linearly, you build a knowledge graph — verses connected by theme, shared Arabic root words, or contrasting concepts. Start from any verse or topic, expand outward, and watch the Quran's internal architecture emerge.

**Live:** [openhikmah.com](https://openhikmah.com)

---

## Features

### Semantic Canvas
- **Infinite knowledge graph** — Verse nodes on a React Flow canvas, connected by AI-generated edges (thematic, root word, contrast). Click any node to read the full verse with Arabic text and translation.
- **AI Connections** — Claude (`claude-opus-4-7` with adaptive thinking) finds three related verses per expansion, grounded in the Maturidi/Hanafi tradition with strict Tanzih framing.
- **Three expansion modes** — "By Theme" (conceptual resonance), "By Root Word" (shared Arabic morphological root), "By Contrast" (theological opposition).
- **Edge explanations** — Click any connection line to see the scholarly reasoning behind why two verses are linked.
- **Canvas persistence** — Your graph auto-saves to localStorage and survives page refreshes. Share any canvas state via a single URL (the `#canvas=` hash encodes the full graph).

### Verse Search
- Direct reference lookup (`2:255`) or full-text search powered by the Quran Foundation search API.
- Results appear as preview cards with a single "Map Connections" action to add the verse to the canvas.

### Divine Names (99 Asmaul Husna)
- All 99 Names catalogued with Maturidi taxonomy: *Sifat al-Dhat* (Names of Essence), *Sifat al-Ma'ani* (Attributes of Meaning), *Sifat al-Af'al* (Attributes of Action).
- Arabic script, transliteration, root morphology, and scholarly description for each Name.
- **Verse Feed** — Verses fetched from Quran Foundation that actually contain each Name's Arabic text (not AI hallucination). AI provides the connection explanation only.
- **Believer's Reflection** (*Takhalluq*) — Claude generates a contemplative reflection on how a believer can embody each Name in daily life, with strict Tanzih constraints.
- **Structural Pairings** — AI identifies 2–3 Names that commonly appear alongside the current Name in the Quran, with scholarly explanation.

### Social & Streaks
- **Daily streaks** — Earn a streak for each day you add verses or make connections on the canvas. Consecutive days extend your streak; a gap resets it.
- **StreakBadge** — Visible in the header when signed in; flame icon with day count.
- **Friends** — Add friends by username; they must accept before appearing on your leaderboard. Pending/accepted states visible on the social page.
- **Leaderboard** — Friends ranked by current streak; your row is highlighted. Motivates daily Quran engagement.
- **Onboarding** — New users pick a username (3–20 chars, alphanumeric + underscore) after their first OAuth sign-in.

### Authentication & Bookmarks
- **OAuth2 PKCE flow** with the Quran Foundation User API — no passwords stored.
- **Bookmarks** — Save verses to your QF account; syncs across devices via the QF API. No bookmark data stored in our DB.

---

## Tech Stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 16 (App Router), React 19, TypeScript |
| Canvas | @xyflow/react v12 |
| State | Zustand v5 |
| Styling | Tailwind CSS v4, Framer Motion |
| AI | Anthropic SDK — `claude-opus-4-7` with adaptive thinking (Gemini fallback via `AI_PROVIDER`) |
| Quran data | alquran.cloud (verse text), Quran Foundation API v4 (search) |
| User data | Quran Foundation User API (OAuth2 PKCE — auth + bookmarks) |
| Database | PostgreSQL 16 + Drizzle ORM |
| Testing | Vitest, Testing Library, jsdom |
| CI | GitHub Actions |
| Deployment | Docker (multi-stage, standalone output) + nginx |

---

## Local Development

**1. Clone and install**

```bash
git clone https://github.com/Nazm-AI/open-hikmah
cd open-hikmah
npm install
```

**2. Set up PostgreSQL**

You need a local Postgres instance. Quickest option:

```bash
docker run -d --name openh-db \
  -e POSTGRES_DB=open_hikmah \
  -e POSTGRES_USER=openh \
  -e POSTGRES_PASSWORD=devpassword \
  -p 5432:5432 \
  postgres:16-alpine
```

**3. Set up environment**

```bash
cp .env.example .env.local
# Fill in all values — see table below for descriptions
```

**4. Run database migrations**

```bash
npx drizzle-kit migrate
```

**5. Run**

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Running with Docker

### Quick start (local)

The `docker-compose.yml` file spins up both the app and a Postgres container:

```bash
# Create a .env file with your credentials (docker-compose reads from .env by default)
cp .env.example .env
# Edit .env and fill in all values, including DB_PASSWORD

# Build and start
docker compose up --build
```

The app will be available at `http://localhost:3000`.

> **Note:** `NEXT_PUBLIC_*` variables are baked into the client bundle at build time. If you change them, you must rebuild the image with `docker compose build`.

### Production deployment

The multi-stage `Dockerfile` produces a minimal production image using Next.js `output: "standalone"`:

```bash
# Build image (pass public env vars as build args)
docker build \
  --build-arg NEXT_PUBLIC_APP_URL=https://yourdomain.com \
  --build-arg NEXT_PUBLIC_QF_CLIENT_ID=your-client-id \
  --build-arg NEXT_PUBLIC_QF_AUTH_BASE=https://prelive-oauth2.quran.foundation \
  -t open-hikmah-app:latest .

# Run with all runtime secrets injected
docker run -d \
  -p 127.0.0.1:3000:3000 \
  -e ANTHROPIC_API_KEY=sk-ant-... \
  -e QF_CLIENT_SECRET=... \
  -e QF_API_BASE=https://api.quran.com \
  -e QF_AUTH_BASE=https://prelive-oauth2.quran.foundation \
  -e DATABASE_URL=postgresql://openh:YOURPASSWORD@db:5432/open_hikmah \
  -e NEXT_PUBLIC_APP_URL=https://yourdomain.com \
  -e NEXT_PUBLIC_QF_CLIENT_ID=your-client-id \
  -e NEXT_PUBLIC_QF_AUTH_BASE=https://prelive-oauth2.quran.foundation \
  open-hikmah-app:latest
```

Or use `docker-compose.yml` on the server — it handles the postgres container, health checks, and volume persistence automatically.

After starting, run migrations on the server once:

```bash
docker exec -it <app-container-name> npx drizzle-kit migrate
```

---

## Environment Variables

See [`.env.example`](.env.example) for the full list with descriptions.

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key for verse connections and divine name content |
| `QF_CLIENT_SECRET` | Yes | Quran Foundation OAuth2 client secret |
| `QF_API_BASE` | Yes | Quran Foundation API base URL (e.g. `https://api.quran.com`) |
| `QF_AUTH_BASE` | Yes | QF auth server URL (e.g. `https://prelive-oauth2.quran.foundation`) |
| `DATABASE_URL` | Yes | PostgreSQL connection string (`postgresql://user:pass@host:5432/db`) |
| `NEXT_PUBLIC_QF_CLIENT_ID` | Yes | OAuth2 client ID — embedded in client bundle |
| `NEXT_PUBLIC_QF_AUTH_BASE` | Yes | Auth server URL — embedded in client bundle |
| `NEXT_PUBLIC_APP_URL` | Yes | Your deployment URL — used in OAuth redirect URI |
| `AI_PROVIDER` | No | `claude` (default) or `gemini` |
| `ANTHROPIC_MODEL` | No | Override model (default: `claude-opus-4-7`) |
| `GEMINI_API_KEY` | No | Required only when `AI_PROVIDER=gemini` |
| `GEMINI_MODEL` | No | Override Gemini model (default: `gemini-2.0-flash`) |
| `DB_PASSWORD` | Docker only | Used by `docker-compose.yml` to set the Postgres password |

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
| `__tests__/api/` | All API route handlers — auth, validation, response shape, streak logic |
| `__tests__/api/social/` | Social routes — streak computation, username validation, friend requests |
| `__tests__/store/` | Zustand canvas and auth stores — state transitions, serialization, restore |

External HTTP calls (`fetch`), the Anthropic SDK, and the database (`@/lib/db`) are all mocked so tests run instantly with no network access and no API or DB costs.

---

## Project Structure

```
app/
  api/
    connections/           # POST — Claude AI finds related verses
    search/                # GET  — Verse search (ref or keyword)
    verse/                 # GET  — Single verse fetch
    bookmarks/             # GET/POST/DELETE — QF User API bookmark sync
    auth/exchange/         # POST — OAuth2 PKCE token exchange + user upsert
    names/                 # GET  — All 99 divine names
    names/[slug]/verses/   # GET  — Verse feed for a divine name
    names/[slug]/reflection/ # GET — Believer's Reflection (AI, cached 30d)
    names/[slug]/pairings/ # GET  — Structural Name pairings (AI, cached 30d)
    social/
      me/                  # GET profile, PATCH username
      activity/            # POST log activity + streak, GET current streak
      friends/             # GET/POST friend list + send request
      friends/[friendId]/  # PATCH accept/decline, DELETE unfriend
      leaderboard/         # GET friends ranked by streak
    health/                # GET — Docker health check endpoint
  callback/                # OAuth2 redirect landing page
  onboarding/              # Username picker (new users only)
  names/                   # /names grid page
  names/[slug]/            # Name detail page (verses + reflection + pairings)
  social/                  # Friends + Leaderboard page
components/
  canvas/                  # React Flow nodes, edges, expand menu
  layout/                  # Header (streak badge, social link, share button)
  search/                  # Search dialog
  social/                  # StreakBadge, FriendList, AddFriendForm, LeaderboardTable
hooks/
  useActivityTracker.ts    # Watches canvas store, fires activity POST on change
  useCanvasPersistence.ts  # localStorage auto-save + shareable URL hash restore
lib/
  pkce.ts                  # PKCE auth URL builder
  surah-names.ts           # Surah number → name lookup
  divine-names.ts          # 99 Asmaul Husna data with Maturidi taxonomy
  ai.ts                    # callAI() — provider abstraction (Claude / Gemini)
  db.ts                    # Drizzle + postgres client
  db/schema.ts             # Database tables: users, friendships, activity_log, challenges
  social-auth.ts           # requireUser() helper — token → QF userinfo → DB user
store/
  canvas.ts                # Verse graph state + serialize/deserialize/restoreCanvas
  auth.ts                  # Auth tokens (memory) + bookmarks (persisted)
  social.ts                # Social profile + streak (memory-only, not persisted)
types/
  quran.ts                 # Shared TypeScript types
__tests__/
  lib/                     # Unit tests for lib/
  api/                     # Route handler tests (including social/)
  store/                   # Store tests
.github/
  workflows/ci.yml         # GitHub Actions CI pipeline
  PULL_REQUEST_TEMPLATE.md
  ISSUE_TEMPLATE/
Dockerfile                 # Multi-stage build: deps → builder → runner
docker-compose.yml         # App + Postgres with health checks
drizzle.config.ts          # Drizzle Kit config
```

---

## API Routes

| Route | Method | Auth | Purpose |
|-------|--------|------|---------|
| `/api/connections` | POST | No | Claude finds related verses |
| `/api/search` | GET | No | Verse search |
| `/api/verse` | GET | No | Single verse fetch |
| `/api/bookmarks` | GET/POST/DELETE | Bearer | QF bookmark sync |
| `/api/auth/exchange` | POST | No | PKCE token exchange |
| `/api/names` | GET | No | All 99 divine names |
| `/api/names/[slug]/verses` | GET | No | Verse feed per name |
| `/api/names/[slug]/reflection` | GET | No | Believer's Reflection |
| `/api/names/[slug]/pairings` | GET | No | Structural pairings |
| `/api/social/me` | GET/PATCH | Bearer | Own profile + username update |
| `/api/social/activity` | GET/POST | Bearer | Streak query + activity log |
| `/api/social/friends` | GET/POST | Bearer | Friend list + send request |
| `/api/social/friends/[id]` | PATCH/DELETE | Bearer | Accept/decline/remove |
| `/api/social/leaderboard` | GET | Bearer | Friends ranked by streak |
| `/api/health` | GET | No | Docker health check |

---

## Deployment

### Docker (recommended for VPS)

See the [Running with Docker](#running-with-docker) section above. Full deployment steps:

1. Provision a VPS (e.g. Hetzner CX22, Ubuntu 24.04)
2. Install Docker + docker-compose
3. Clone the repo and create `.env` with production credentials
4. `docker compose up --build -d`
5. Run `docker exec -it <app> npx drizzle-kit migrate` once
6. Set up nginx as a reverse proxy to `localhost:3000` with SSL (Certbot)
7. Register `https://yourdomain.com/callback` as a redirect URI with Quran Foundation

### Vercel

1. Push to GitHub and import the repo at [vercel.com/new](https://vercel.com/new)
2. Add all environment variables from `.env.example` in Vercel's project settings
3. Add a PostgreSQL database (e.g. Vercel Postgres or Neon) and set `DATABASE_URL`
4. Under **Domains**, add your custom domain
5. Register `https://yourdomain.com/callback` as a redirect URI with Quran Foundation
6. Run `npx drizzle-kit migrate` once to create the schema

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
