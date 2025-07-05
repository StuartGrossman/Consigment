#!/bin/bash

# Summit Gear Exchange - Development Server Starter
# This script activates the virtual environment and starts the development server with auto-reload

echo "🔧 Summit Gear Exchange - Starting Development Server"
echo "📁 Activating virtual environment..."

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "❌ Virtual environment not found. Please run: python -m venv venv && source venv/bin/activate && pip install -r requirements.txt"
    exit 1
fi

# Activate virtual environment
source venv/bin/activate

# Check if watchfiles is installed
if ! python -c "import watchfiles" 2>/dev/null; then
    echo "📦 Installing watchfiles for auto-reload..."
    pip install watchfiles
fi

# Kill any existing server processes
echo "🧹 Cleaning up any existing server processes..."
pkill -f "uvicorn main:app" 2>/dev/null || true

# Start the development server
echo "🚀 Starting development server with auto-reload..."
echo "🌐 Server will be available at: http://localhost:8002"
echo "📱 Frontend should be running at: http://localhost:5174"
echo "⏹️  Press Ctrl+C to stop"
echo ""

python dev.py 