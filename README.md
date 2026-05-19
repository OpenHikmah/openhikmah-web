# Open Hikmah

A theological sensemaking tool for the Quran. Instead of reading linearly, you build a knowledge graph — verses connected by theme, shared Arabic root words, or contrasting concepts. Start from any verse or topic, expand outward, and watch the Quran's internal architecture emerge.

**Live:** [openhikmah.com](https://openhikmah.com)

---

## Features

- **Semantic Explorer** — Infinite canvas where verse nodes connect via AI-generated edges (thematic, root word, contrast). Click any node to read the full verse and tafsir. Click any edge to see the theological reason for the connection.
- **AI Connections** — Claude (`claude-opus-4-7`) finds three related verses for each expansion, grounded in the Maturidi/Hanafi tradition with strict Tanzih framing.
- **Verse Search** — Direct ref lookup (`2:255`) or semantic text search. Results appear as preview cards with a single "Map Connections" action.
- **Bookmarks** — Save verses to your Quran Foundation account. Syncs across devices via the Quran Foundation User API.
- **Divine Names** *(coming soon)* — All 99 Asma-ul-Husna with Maturidi taxonomy, root morphology, verse feeds, and Takhalluq reflections.

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
| `ANTHROPIC_API_KEY` | Anthropic API key for verse connections |
| `QF_CLIENT_SECRET` | Quran Foundation OAuth2 client secret |
| `QF_API_BASE` | Quran Foundation API base URL |
| `QF_AUTH_BASE` | Quran Foundation auth server URL |
| `NEXT_PUBLIC_QF_CLIENT_ID` | OAuth2 client ID (public) |
| `NEXT_PUBLIC_QF_AUTH_BASE` | Auth server URL (public, for PKCE redirect) |
| `NEXT_PUBLIC_APP_URL` | Your deployment URL (used in OAuth redirect URI) |

---

## Deployment

The app is deployed on Vercel with a custom domain.

**Deploy your own:**

1. Push to GitHub and import the repo at [vercel.com/new](https://vercel.com/new)
2. Add all environment variables from `.env.example` in Vercel's project settings
3. Under **Domains**, add your custom domain and follow the DNS instructions
4. Register `https://yourdomain.com/callback` as a redirect URI with Quran Foundation

---

## Project Structure

```
app/
  api/
    connections/     # POST — Claude AI finds related verses
    search/          # GET  — Verse search (ref or text)
    verse/           # GET  — Single verse fetch
    bookmarks/       # GET/POST/DELETE — Quran Foundation User API
    auth/exchange/   # POST — OAuth2 PKCE token exchange
  auth/callback/     # OAuth2 redirect landing page
components/
  canvas/            # React Flow nodes, edges, expand menu
  layout/            # Header, context sidebar
  search/            # Search dialog
lib/
  pkce.ts            # PKCE auth URL builder
  surah-names.ts     # Shared surah name lookup
store/
  canvas.ts          # Verse graph state (Zustand)
  auth.ts            # Auth + bookmarks state (Zustand + persist)
types/
  quran.ts           # Shared TypeScript types
```
