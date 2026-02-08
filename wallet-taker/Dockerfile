FROM oven/bun:1.3.6

WORKDIR /app

# Install only runtime dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production --verbose

# App source
COPY src ./src

# Runtime data directory for SQLite
RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV API_HOST=0.0.0.0
ENV API_PORT=3001
ENV DATABASE_PATH=/app/data/withdrawals.db

EXPOSE 3001

CMD ["bun", "run", "src/index.ts"]
