# Stage 1: Install all dependencies
FROM oven/bun:1-alpine AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Stage 2: Build the Next.js app
FROM oven/bun:1-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* vars are baked into the client bundle at build time.
# Pass them as build args from docker-compose (reads from .env on the server).
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_QF_CLIENT_ID
ARG NEXT_PUBLIC_QF_AUTH_BASE
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_QF_CLIENT_ID=$NEXT_PUBLIC_QF_CLIENT_ID
ENV NEXT_PUBLIC_QF_AUTH_BASE=$NEXT_PUBLIC_QF_AUTH_BASE

# Server-side secrets are not needed at build time — Next.js only requires them
# to exist as non-empty strings for static analysis. Use placeholders here;
# real values are injected at runtime via docker-compose environment.
ENV ANTHROPIC_API_KEY=build-placeholder
ENV QF_CLIENT_SECRET=build-placeholder
ENV QF_API_BASE=https://placeholder.example.com
ENV QF_AUTH_BASE=https://placeholder.example.com
ENV DATABASE_URL=postgresql://openh:placeholder@localhost:5432/open_hikmah

RUN bun run build

# Stage 3: Minimal production image using Next.js standalone output
FROM oven/bun:1-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Create a non-root user for security
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

# Copy only what's needed to run the server
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Migration runner — bun scripts/migrate.mjs (uses drizzle-orm, no drizzle-kit needed)
COPY --from=builder --chown=nextjs:nodejs /app/scripts/migrate.mjs ./scripts/migrate.mjs
COPY --from=builder --chown=nextjs:nodejs /app/scripts/ensure-tables.mjs ./scripts/ensure-tables.mjs
COPY --from=builder --chown=nextjs:nodejs /app/lib/infra/db/migrations ./lib/infra/db/migrations

# postgres and drizzle-orm are bundled into Next.js chunks and not left in
# standalone node_modules, so migrate.mjs can't resolve them without these copies.
COPY --from=deps /app/node_modules/postgres ./node_modules/postgres
COPY --from=deps /app/node_modules/drizzle-orm ./node_modules/drizzle-orm

# One-time data-backfill scripts (run manually from a container shell; all
# idempotent + resumable). seed-quran pulls the corpus from alquran.cloud;
# embed-corpus needs GEMINI_API_KEY + the verses table seeded; seed-morphology
# reads data/morphology/*.jsonl. The Gemini SDK is bundled into the app chunks but
# a standalone .mjs needs it resolvable in node_modules (same reason as postgres).
COPY --from=builder --chown=nextjs:nodejs /app/scripts/seed-quran.mjs ./scripts/seed-quran.mjs
COPY --from=builder --chown=nextjs:nodejs /app/scripts/embed-corpus.mjs ./scripts/embed-corpus.mjs
COPY --from=builder --chown=nextjs:nodejs /app/scripts/seed-morphology.mjs ./scripts/seed-morphology.mjs
COPY --from=builder --chown=nextjs:nodejs /app/data/morphology ./data/morphology
COPY --from=deps /app/node_modules/@google/generative-ai ./node_modules/@google/generative-ai

USER nextjs
EXPOSE 3000
# Run pending migrations (idempotent) then start the server.
# This ensures new tables are always created on deploy without a manual step.
CMD ["sh", "-c", "bun scripts/migrate.mjs && bun scripts/ensure-tables.mjs && bun server.js"]
