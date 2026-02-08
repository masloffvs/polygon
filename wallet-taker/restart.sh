#!/bin/bash

echo "🔄 Restarting Wallet Taker..."

# Kill existing process
pkill -f "bun run src/index.ts" || true
sleep 1

# Start new process
echo "🚀 Starting server..."
bun run src/index.ts &

echo "✅ Server restarted!"
echo "📊 Check logs: tail -f logs/wallet-taker.log"
echo "🌐 API: http://localhost:3001"
echo "🎨 Web: http://localhost:5173"
