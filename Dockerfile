# Stage 1: Install all dependencies
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

# Stage 2: Build the Next.js app
FROM node:22-alpine AS builder
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

RUN npm run build

# Stage 3: Minimal production image using Next.js standalone output
FROM node:22-alpine AS runner
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

# Migration runner — node scripts/migrate.mjs (uses drizzle-orm, no drizzle-kit needed)
COPY --from=builder --chown=nextjs:nodejs /app/scripts/migrate.mjs ./scripts/migrate.mjs
COPY --from=builder --chown=nextjs:nodejs /app/lib/db/migrations ./lib/db/migrations

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
