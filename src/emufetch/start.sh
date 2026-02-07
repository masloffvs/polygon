#!/bin/bash

# Start virtual framebuffer
echo "🖥️  Starting Xvfb..."
Xvfb :99 -screen 0 1920x1080x24 &
export DISPLAY=:99

# Wait for Xvfb
sleep 2

# Start window manager (optional, makes browser behave better)
echo "🪟 Starting Fluxbox..."
fluxbox &

# Start VNC server for debugging (optional)
if [ "$ENABLE_VNC" = "true" ]; then
    echo "📺 Starting VNC server on port 5900..."
    x11vnc -display :99 -forever -nopw -quiet &
fi

# Start the emufetch server
echo "🚀 Starting emufetch..."
cd /app
exec bun run src/emufetch/index.ts
