#!/bin/bash

# Quick setup script for testing the multiplayer server

echo "🎮 Ludo Multiplayer Server - Test Setup"
echo "========================================"
echo ""

# Check if Redis is running
echo "📡 Checking Redis..."
if redis-cli ping > /dev/null 2>&1; then
    echo "✅ Redis is running"
else
    echo "❌ Redis is not running"
    echo ""
    echo "Please start Redis:"
    echo "  macOS: brew services start redis"
    echo "  Linux: sudo systemctl start redis"
    echo "  Docker: docker run -d -p 6379:6379 redis"
    exit 1
fi

echo ""

# Check if Node modules are installed
echo "📦 Checking dependencies..."
if [ -d "node_modules" ]; then
    echo "✅ Dependencies installed"
else
    echo "⚠️  Installing dependencies..."
    npm install
fi

echo ""

# Build the server
echo "🔨 Building server..."
npm run build

if [ $? -eq 0 ]; then
    echo "✅ Build successful"
else
    echo "❌ Build failed"
    exit 1
fi

echo ""

# Clear Redis data (optional)
read -p "🗑️  Clear Redis data? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    redis-cli FLUSHALL
    echo "✅ Redis data cleared"
fi

echo ""
echo "🚀 Starting server..."
echo "========================================"
echo ""
echo "Server will start on http://localhost:3000"
echo "Health check: http://localhost:3000/health"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

# Start the server
npm start
