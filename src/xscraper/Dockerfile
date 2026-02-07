# xscraper - Twitter/X Scraper via Browser Emulation
FROM oven/bun:latest

# Set Puppeteer env BEFORE install to skip Chromium download
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Install dependencies for Puppeteer with real display
RUN apt-get update && apt-get install -y --no-install-recommends \
    # Chromium dependencies
    chromium \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    # Virtual display for non-headless mode
    xvfb \
    x11vnc \
    fluxbox \
    # Cleanup
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy service-local package file (avoid installing the whole monorepo deps)
COPY src/xscraper/package.json ./package.json

# Install dependencies with timeout/retry to avoid indefinite hangs
RUN timeout 300 bun install --no-save --ignore-scripts --network-timeout=60000 --backend=hardlink || \
    (echo "Retrying xscraper install..." && \
     timeout 300 bun install --no-save --ignore-scripts --network-timeout=60000 --backend=hardlink)

# Copy source
COPY src/xscraper ./src/xscraper
COPY tsconfig.json ./

# Create cookies directory
RUN mkdir -p /app/cookies

# Expose ports
# 8918 - API
# 5901 - VNC (optional, for debugging)
EXPOSE 8918 5901

# Entry point
COPY src/xscraper/start.sh /start.sh
RUN chmod +x /start.sh
CMD ["/start.sh"]
