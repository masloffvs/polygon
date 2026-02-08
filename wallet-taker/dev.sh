#!/bin/bash

echo "🚀 Starting Wallet Taker..."
echo ""
echo "Backend API: http://localhost:3001"
echo "Web Panel:   http://localhost:3002"
echo "Swagger:     http://localhost:3001/swagger"
echo ""

# Start backend in background
bun run src/index.ts &
BACKEND_PID=$!

# Wait a bit for backend to start
sleep 2

# Start frontend in background
cd web && bun run dev &
FRONTEND_PID=$!

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "🛑 Stopping services..."
    kill $BACKEND_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    exit
}

# Trap Ctrl+C
trap cleanup INT TERM

echo "✅ Services started!"
echo "Press Ctrl+C to stop"
echo ""

# Wait for both processes
wait
