FROM node:20-alpine AS base

# Install pnpm via corepack
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# ---------------------------------------------
# Development Target
# ---------------------------------------------
FROM base AS development
WORKDIR /app

# Copy root workspace files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./

# Copy package.json of all workspaces to install dependencies
# This leverages Docker cache so we don't reinstall if only source code changes
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/db/package.json ./packages/db/
COPY packages/shared/package.json ./packages/shared/

# Install dependencies for the monorepo
RUN pnpm install

# Copy all source files
COPY . .

# Set environment variables for development
ENV NODE_ENV=development

EXPOSE 3000

# Start the development server for the web app
CMD ["pnpm", "--filter", "@wms/web", "dev"]

# ---------------------------------------------
# Builder Target (for Production)
# ---------------------------------------------
FROM base AS builder
WORKDIR /app

# Declare build argument and export it as env variable for compilation
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

# Copy everything
COPY . .

# Install dependencies
RUN pnpm install

# Build the Next.js application
# Note: Next.js standalone output must be enabled in next.config.ts
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @wms/web build

# ---------------------------------------------
# Production Target
# ---------------------------------------------
FROM base AS production
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Secure the container by running as a non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# The Next.js standalone build outputs a monorepo structure.
# It places the entrypoint at apps/web/server.js relative to the project root.
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone/ ./

# Copy static assets (standalone does not include static or public folders by default)
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
# Uncomment if there is a public folder in apps/web:
# COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public

USER nextjs

EXPOSE 3000

ENV PORT=3000
# Ensure Next.js binds to all network interfaces in Docker
ENV HOSTNAME="0.0.0.0"

CMD ["node", "apps/web/server.js"]
