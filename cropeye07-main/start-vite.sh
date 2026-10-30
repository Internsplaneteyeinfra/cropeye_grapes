#!/bin/bash

# Start Vite development server
# This script uses the configuration from vite.config.ts
# The vite.config.ts file contains all build and server configuration

echo "Starting Vite development server..."
echo "Configuration loaded from: vite.config.ts"
echo ""

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
    echo ""
fi

# Run vite dev server (uses vite.config.ts automatically)
npm run dev
