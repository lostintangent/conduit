#!/bin/bash

# Push conduit-sandbox image to GitHub Container Registry
# Usage: ./push-to-ghcr.sh [tag]
# Example: ./push-to-ghcr.sh latest
#          ./push-to-ghcr.sh v1.0.0

set -e

IMAGE_NAME="conduit-sandbox"
TAG="${1:-latest}"

# Validate tag format (alphanumeric, dots, dashes, underscores only)
if [[ ! "$TAG" =~ ^[a-zA-Z0-9._-]+$ ]]; then
    echo "Error: Invalid tag format: '$TAG'"
    echo "Tags can only contain alphanumeric characters, dots, dashes, and underscores."
    exit 1
fi

echo "🔐 Logging into GitHub Container Registry..."

# Check if gh CLI is available
if ! command -v gh &> /dev/null; then
    echo "Error: GitHub CLI (gh) is not installed."
    echo "Install it with: brew install gh"
    exit 1
fi

# Check if gh is authenticated
if ! gh auth status &> /dev/null; then
    echo "Error: GitHub CLI is not authenticated."
    echo "Please run: gh auth login"
    exit 1
fi

GH_USERNAME=$(gh api user -q .login)
GHCR_REPO="ghcr.io/${GH_USERNAME}/conduit-sandbox"

gh auth token | docker login ghcr.io -u "$GH_USERNAME" --password-stdin

echo "🏷️  Tagging image as ${GHCR_REPO}:${TAG}..."
docker tag "$IMAGE_NAME" "${GHCR_REPO}:${TAG}"

echo "🚀 Pushing image to GitHub Container Registry..."
docker push "${GHCR_REPO}:${TAG}"

echo "✅ Successfully pushed ${GHCR_REPO}:${TAG}"
