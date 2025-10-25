#!/bin/bash

# Conduit Installation Script
# This script installs dependencies, packages the app, and installs it to /Applications

set -e  # Exit on any error

echo "🚀 Starting Conduit installation..."

# Check if we're on macOS
if [[ "$OSTYPE" != "darwin"* ]]; then
  echo "❌ Error: This script is designed for macOS only"
  exit 1
fi

# Get the directory where the script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Step 1: Install dependencies
echo ""
echo "📦 Installing dependencies..."
npm install

# Step 2: Package the application
echo ""
echo "🔨 Building application..."
npm run package

# Step 3: Determine architecture and find the app
echo ""
echo "🔍 Locating built application..."

# Check for arm64 first (Apple Silicon), then x64 (Intel)
if [ -d "out/Conduit-darwin-arm64/Conduit.app" ]; then
  APP_PATH="out/Conduit-darwin-arm64/Conduit.app"
elif [ -d "out/Conduit-darwin-x64/Conduit.app" ]; then
  APP_PATH="out/Conduit-darwin-x64/Conduit.app"
else
  echo "❌ Error: Could not find built application in out/ directory"
  exit 1
fi

echo "✅ Found application at: $APP_PATH"

# Step 4: Install to Applications folder
INSTALL_PATH="/Applications/Conduit.app"

echo ""
echo "📱 Installing to Applications folder..."

# Remove old version if it exists
if [ -d "$INSTALL_PATH" ]; then
  echo "🗑️  Removing old version..."
  rm -rf "$INSTALL_PATH"
fi

# Copy the new version
echo "📋 Copying new version..."
cp -R "$APP_PATH" "$INSTALL_PATH"

# Verify installation
if [ -d "$INSTALL_PATH" ]; then
  echo ""
  echo "✅ Installation complete!"
  echo "🎉 Conduit has been installed to /Applications/Conduit.app"
  echo ""
  echo "You can now launch Conduit from your Applications folder or Spotlight."
else
  echo "❌ Error: Installation failed"
  exit 1
fi
