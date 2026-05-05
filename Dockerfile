# Trade-OS Polymarket dashboard with Claude Code (Max subscription) for production analysis.
#
# Auth: at runtime, set the CLAUDE_CODE_OAUTH_TOKEN env var (generate via
#       `claude setup-token` on a machine logged into your Max account).
#       This tells the bundled Claude Code CLI to authenticate against your
#       Max sub when `claude -p` is spawned by the Polymarket pipeline.

FROM node:20-bookworm-slim AS deps

# System deps for Claude Code subprocess (curl/git used by some skills, etc.)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates git \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Claude Code globally so `claude` is on PATH for subprocess use
RUN npm install -g @anthropic-ai/claude-code

# Install app dependencies (cached layer when package.json doesn't change)
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev=false

# ── Build stage ────────────────────────────────────────────────────────────
FROM deps AS build
COPY . .
# Skip the instrumentation pre-warm during build (it tries to fetch from
# localhost which doesn't exist yet at build time)
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ── Runtime stage ──────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS runtime

# Re-install system tools + Claude Code for runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates git \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g @anthropic-ai/claude-code

WORKDIR /app

# Copy build artifacts and dependencies from the build stage
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/next.config.js ./next.config.js
COPY --from=build /app/instrumentation.ts ./instrumentation.ts

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Claude Code expects writable HOME for session/cache state
RUN mkdir -p /home/nextjs/.claude && chown -R 1001:1001 /home/nextjs
ENV HOME=/home/nextjs

# At runtime, Railway provides:
#   - CLAUDE_CODE_OAUTH_TOKEN (your `claude setup-token` output) → enables Max sub
#   - GROQ_API_KEY (fallback if claude -p fails)
#   - POLYMARKET_API_KEY (read-only public data, optional)
#   - PORT (Railway injects this)
CMD ["npm", "start"]
