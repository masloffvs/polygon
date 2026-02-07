# Stage 1: Install dependencies using Bun
FROM oven/bun:1.3.8 AS base
WORKDIR /usr/src/app

FROM base AS install
RUN mkdir -p /temp/dev
COPY package.json bun.lock /temp/dev/

# Configure Puppeteer cache to a fixed location for copying
ENV PUPPETEER_CACHE_DIR=/temp/puppeteer_cache

# Install dependencies with timeout and optimizations
# --ignore-scripts prevents postinstall hangs
# --network-timeout adds timeout for network operations
# --backend=hardlink uses hardlinks for faster installs
RUN cd /temp/dev && \
    timeout 600 bun install --no-save --ignore-scripts --network-timeout=60000 --backend=hardlink || \
    (echo "First install attempt timed out or failed, retrying..." && \
     timeout 600 bun install --no-save --ignore-scripts --network-timeout=60000)

# install prod deps
RUN mkdir -p /temp/prod
COPY package.json bun.lock /temp/prod/
RUN cd /temp/prod && \
    timeout 600 bun install --production --no-save --ignore-scripts --network-timeout=60000 --backend=hardlink || \
    (echo "First prod install attempt timed out or failed, retrying..." && \
     timeout 600 bun install --production --no-save --ignore-scripts --network-timeout=60000)

# Ensure chrome is installed in the cache directory
RUN cd /temp/prod && timeout 300 bun x puppeteer browsers install chrome

# Stage 2: Runtime image using Bun
FROM base AS release
# Install libraries required for Puppeteer/Chrome
RUN apt-get update && apt-get install -y \
    bash \
    ca-certificates \
    curl \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    wget \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

COPY --from=install /temp/prod/node_modules node_modules
COPY src src
COPY package.json .
COPY bunfig.toml .
COPY tsconfig.json .

# Copy puppeteer cache and set environment variable
COPY --from=install /temp/puppeteer_cache /home/bun/.cache/puppeteer
ENV PUPPETEER_CACHE_DIR=/home/bun/.cache/puppeteer

# Create user_files with correct permissions and ensure bun owns everything
RUN mkdir -p user_files && chown -R bun:bun /usr/src/app && chown -R bun:bun /home/bun/.cache

# run the app
USER bun
EXPOSE 3000/tcp
EXPOSE 3001/tcp
ENTRYPOINT [ "bun", "run", "start" ]
