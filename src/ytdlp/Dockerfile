FROM oven/bun:1-alpine

# Install yt-dlp and dependencies
RUN apk add --no-cache python3 py3-pip ffmpeg && \
    pip3 install --break-system-packages yt-dlp

WORKDIR /app

# Create downloads and cookies directory
RUN mkdir -p /app/downloads /app/cookies

COPY src/ytdlp/server.ts .
COPY src/ytdlp/package.json .

RUN bun install --verbose

EXPOSE 8917

CMD ["bun", "run", "server.ts"]
