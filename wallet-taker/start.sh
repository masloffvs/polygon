#!/bin/bash

echo "🚀 Starting Wallet Taker..."
echo ""

# Check if web dependencies are installed
if [ ! -d "web/node_modules" ]; then
    echo "📦 Installing web dependencies..."
    cd web && bun install && cd ..
fi

# Start both backend and frontend
echo "🔥 Starting backend and frontend..."
echo ""
echo "Backend API: http://localhost:3001"
echo "Web Panel:   http://localhost:3002"
echo "Swagger:     http://localhost:3001/swagger"
echo ""

bun run dev:web+server
