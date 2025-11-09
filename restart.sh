#!/bin/bash

# Kill any process using port 3000
echo "🔍 Checking for processes on port 3000..."
PID=$(lsof -ti:3000)

if [ -n "$PID" ]; then
  echo "⚠️  Found process $PID using port 3000"
  echo "🔪 Killing process..."
  kill -9 $PID
  echo "✅ Process killed"
  sleep 1
else
  echo "✅ Port 3000 is free"
fi

# Start the server
echo "🚀 Starting server..."
npm run dev
