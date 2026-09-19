# Use official lightweight Bun image (Bun 1.4+)
FROM oven/bun:1-slim AS base
WORKDIR /app

# Install build dependencies for native SQLite compilation
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy package manifests and lockfile
COPY package.json bun.lock ./
COPY server/package.json ./server/
COPY client/package.json ./client/

# Install dependencies
RUN bun install --frozen-lockfile

# Copy application source code
COPY . .

# Build client PWA into client/dist
RUN bun run build

# Set environment and expose port
ENV PORT=3000
ENV NODE_ENV=production
EXPOSE 3000

# Persist SQLite database volume if mounted at /app/data
VOLUME ["/app/data"]

# Run the unified production server
CMD ["bun", "server/src/index.ts"]
