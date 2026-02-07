# Use newer bun version and debian base (alpine causes segfaults with crypto libs)
FROM oven/bun:1.3.8 AS base

WORKDIR /app

# Install curl for healthchecks
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Copy dependency files
COPY package.json tsconfig.json ./

# Install dependencies in stages to avoid segfaults
# Stage 1: Install core dependencies first
RUN echo "Installing core dependencies..." && \
    timeout 300 bun add elysia @elysiajs/cors @elysiajs/openapi postgres redis yaml pino pino-pretty --no-save || true

# Stage 2: Install blockchain libraries (these can cause segfaults)
RUN echo "Installing blockchain dependencies..." && \
    timeout 300 bun add @solana/web3.js viem --no-save || true

# Stage 3: Install remaining dependencies with all optimizations
RUN echo "Installing all dependencies..." && \
    timeout 600 bun install --ignore-scripts --network-timeout=60000 || \
    (echo "Retrying install without scripts..." && \
     timeout 600 bun install --ignore-scripts --network-timeout=60000) || \
    (echo "Final retry with minimal flags..." && \
     timeout 600 bun install --network-timeout=60000)

# Copy source code
COPY . .

EXPOSE 3000

CMD ["bun", "run", "src/app.ts"]
