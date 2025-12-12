#!/bin/bash

# Build and publish a Conduit Sandbox microVM image
# 1. Pushes Docker image to GitHub Container Registry
# 2. Creates a VM image via the sandbox manager API
# 
# Usage: ./create-conduit-microVM-image.sh [tag]
# Example: ./create-conduit-microVM-image.sh latest
#          ./create-conduit-microVM-image.sh v1.0.0

set -e

IMAGE_NAME="conduit-sandbox"
TAG="${1:-latest}"
MANAGER_URL="https://green.sandbox.githubnext.com"

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

echo "🔨 Building image for linux/amd64 platform..."
docker buildx build --platform linux/amd64 -t "${GHCR_REPO}:${TAG}" -f build/sandbox/Dockerfile . --push

echo "✅ Successfully built and pushed ${GHCR_REPO}:${TAG}"

# --- Create VM Image via API ---

echo ""
echo "🖼️  Creating VM image from ${GHCR_REPO}:${TAG}..."

# Get GitHub token for API authentication
GH_TOKEN=$(gh auth token)

# Create the VM image using the Images API
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${MANAGER_URL}/api/images/custom" \
    -H "Authorization: Bearer ${GH_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{
        \"description\": \"Conduit Sandbox - ${TAG}\",
        \"docker\": \"${GHCR_REPO}:${TAG}\",
        \"labels\": [\"conduit\", \"sandbox\", \"Conduit Latest Image\"],
        \"size\": \"8G\",
        \"ports\": {
            \"9876\": \"conduit-server\"
        },
        \"post_create_command\": \"/usr/local/bin/conduit-server -workspace /workspace\",
        \"public\": true
    }")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [[ "$HTTP_CODE" -lt 200 || "$HTTP_CODE" -ge 300 ]]; then
    echo "❌ Failed to create VM image (HTTP ${HTTP_CODE})"
    echo "$BODY"
    exit 1
fi

IMAGE_ID=$(echo "$BODY" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [[ -z "$IMAGE_ID" ]]; then
    echo "❌ Failed to parse image ID from response"
    echo "$BODY"
    exit 1
fi

echo "📦 VM image created with ID: ${IMAGE_ID}"
echo "⏳ Waiting for image build to complete..."

# Poll for image status
MAX_ATTEMPTS=60  # 10 minutes max (60 * 10 seconds)
ATTEMPT=0

while [[ $ATTEMPT -lt $MAX_ATTEMPTS ]]; do
    ATTEMPT=$((ATTEMPT + 1))
    
    STATUS_RESPONSE=$(curl -s -X GET "${MANAGER_URL}/api/images/${IMAGE_ID}" \
        -H "Authorization: Bearer ${GH_TOKEN}")
    
    STATUS=$(echo "$STATUS_RESPONSE" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
    
    case "$STATUS" in
        "ready")
            echo ""
            echo "✅ VM image is ready!"
            echo ""
            echo "🚀 Create a VM with:"
            echo "   curl -X POST \"\$MANAGER_URL/api/vms\" \\"
            echo "     -H \"Authorization: Bearer \$(gh auth token)\" \\"
            echo "     -H \"Content-Type: application/json\" \\"
            echo "     -d '{\"image_id\": \"${IMAGE_ID}\", \"name\": \"my-sandbox\"}'"
            exit 0
            ;;
        "failed")
            ERROR_MSG=$(echo "$STATUS_RESPONSE" | grep -o '"error_message":"[^"]*"' | cut -d'"' -f4)
            echo ""
            echo "❌ VM image build failed!"
            echo "   Error: ${ERROR_MSG}"
            exit 1
            ;;
        "building")
            printf "\r⏳ Building... (attempt ${ATTEMPT}/${MAX_ATTEMPTS})"
            sleep 10
            ;;
        *)
            echo ""
            echo "⚠️  Unknown status: ${STATUS}"
            echo "$STATUS_RESPONSE"
            sleep 10
            ;;
    esac
done

echo ""
echo "⏰ Timeout waiting for image build to complete."
echo "   Check status manually: curl -X GET \"\$MANAGER_URL/api/images/${IMAGE_ID}\" -H \"Authorization: Bearer \$(gh auth token)\""
exit 1
