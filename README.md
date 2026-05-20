# Open Hikmah

[![CI](https://github.com/Nazm-AI/open-hikmah/actions/workflows/ci.yml/badge.svg)](https://github.com/Nazm-AI/open-hikmah/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A Quran study tool built around a knowledge graph. Instead of reading linearly, you place verses on a canvas and let AI find the connections — shared root words, thematic resonance, theological contrast. Watch the Quran's internal architecture emerge as you explore.

**Live:** [openhikmah.com](https://openhikmah.com)

---

## Features

**Canvas** — Infinite knowledge graph of verse nodes connected by AI-generated edges. Three expansion modes: By Theme, By Root Word, By Contrast. Click any edge to read the scholarly reasoning. Your canvas auto-saves and can be shared via a single URL.

**Search** — Direct reference lookup (`2:255`) or full-text search. One click adds any verse to the canvas.

**Divine Names** — All 99 Asmaul Husna with Maturidi taxonomy, Arabic script, root morphology, verse feed (verses that actually contain each Name's text), and a contemplative Believer's Reflection.

**Audio** — Play all canvas verses in Quran order with a single button.

**Bookmarks** — Save verses to your Quran Foundation account; syncs across devices.

**Social** — Daily streaks for Quran engagement, a friends leaderboard, and head-to-head challenges: pick a friend, a duration (24h / 48h / 7d), and compete on total Quran activity. The friend with the most activities in the window wins.

---

## Tech Stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 16 (App Router), React 19, TypeScript |
| Canvas | @xyflow/react v12 |
| State | Zustand v5 |
| Styling | Tailwind CSS v4 |
| AI | Anthropic Claude (adaptive thinking) with Gemini fallback |
| Quran data | alquran.cloud + Quran Foundation API |
| Auth | Quran Foundation OAuth2 PKCE |
| Database | PostgreSQL 16 + Drizzle ORM |
| Testing | Vitest + jsdom |
| CI | GitHub Actions |

---

## Local Development

**Prerequisites:** Node 20+, npm, a local PostgreSQL instance.

```bash
git clone https://github.com/Nazm-AI/open-hikmah
cd open-hikmah
npm install
```

**Start Postgres:**

```bash
docker run -d --name openh-db \
  -e POSTGRES_DB=open_hikmah \
  -e POSTGRES_USER=openh \
  -e POSTGRES_PASSWORD=devpassword \
  -p 5432:5432 \
  postgres:16-alpine
```

**Configure environment:**

```bash
cp .env.example .env.local
# Fill in the values — see .env.example for descriptions
```

**Migrate and run:**

```bash
npx drizzle-kit migrate
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Project Structure

```
app/
  api/
    connections/           # POST — AI finds related verses
    search/                # GET  — Verse search
    verse/                 # GET  — Single verse fetch
    share/                 # POST/GET — Canvas share link storage
    bookmarks/             # GET/POST/DELETE — QF bookmark sync
    auth/exchange/         # POST — OAuth2 PKCE token exchange
    names/                 # GET + sub-routes — 99 divine names
    social/
      me/                  # GET/PATCH — own profile
      activity/            # GET/POST — streak + activity log
      friends/             # GET/POST — friend list + requests
      friends/[id]/        # PATCH/DELETE — accept/decline/remove
      leaderboard/         # GET — friends ranked by streak
      challenges/          # GET/POST — challenge list + send
      challenges/[id]/     # PATCH — accept/decline challenge
    health/                # GET — health check
  callback/                # OAuth2 redirect handler
  onboarding/              # Username picker (new users)
  names/                   # 99 Names grid + detail pages
  social/                  # Friends, leaderboard, challenges
components/
  canvas/                  # React Flow nodes, edges, expand menu
  layout/                  # Header
  search/                  # Search dialog
  social/                  # StreakBadge, FriendList, ChallengeList, forms
hooks/
  useActivityTracker.ts    # Fires activity POST on canvas change
  useCanvasPersistence.ts  # localStorage auto-save + share URL restore
lib/
  db/schema.ts             # Tables: users, friendships, activity_log, challenges, shared_canvases
  social-auth.ts           # requireUser() — token → QF userinfo → DB user
  ai.ts                    # callAI() — Claude / Gemini abstraction
store/
  canvas.ts                # Verse graph state
  auth.ts                  # Auth tokens + bookmarks
  social.ts                # Social profile + streak
```

---

## Testing

```bash
npm run test        # watch mode
npm run test:ci     # single run (used in CI)
```

All external calls (fetch, Anthropic SDK, database) are mocked — tests run in milliseconds with no network access or API costs.

---

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a PR.

- Branch from `main` with `feat/`, `fix/`, `docs/`, or `chore/` prefixes
- Run `npm run lint && npx tsc --noEmit && npm run test:ci` before pushing
- Use conventional commit messages
- Theological changes (AI prompts, divine name data, verse framing) require extra care — see [Theological Standards](CONTRIBUTING.md#theological-standards)

## Security

Report vulnerabilities privately to **security@openhikmah.com**. See [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
