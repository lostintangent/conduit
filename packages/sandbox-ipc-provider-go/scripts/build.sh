#!/bin/bash
set -e

# Build script for sandbox-ipc-provider-go
# Creates binaries for multiple platforms

VERSION="${VERSION:-dev}"
OUTPUT_DIR="${OUTPUT_DIR:-dist}"
BINARY_NAME="sandbox-ipc"

# Ensure output directory exists
mkdir -p "$OUTPUT_DIR"

echo "Building sandbox-ipc-provider-go v${VERSION}..."
echo ""

# Platforms to build for
PLATFORMS=(
    "linux/amd64"
    "linux/arm64"
    "darwin/amd64"
    "darwin/arm64"
    "windows/amd64"
)

for PLATFORM in "${PLATFORMS[@]}"; do
    GOOS="${PLATFORM%/*}"
    GOARCH="${PLATFORM#*/}"
    
    OUTPUT_NAME="${BINARY_NAME}-${GOOS}-${GOARCH}"
    if [ "$GOOS" = "windows" ]; then
        OUTPUT_NAME="${OUTPUT_NAME}.exe"
    fi
    
    echo "Building for ${GOOS}/${GOARCH}..."
    
    CGO_ENABLED=0 GOOS="$GOOS" GOARCH="$GOARCH" go build \
        -ldflags="-w -s -X main.version=${VERSION}" \
        -o "${OUTPUT_DIR}/${OUTPUT_NAME}" \
        ./cmd/server
    
    echo "  → ${OUTPUT_DIR}/${OUTPUT_NAME}"
done

echo ""
echo "Build complete!"
echo ""

# Show file sizes
echo "Binary sizes:"
ls -lh "$OUTPUT_DIR" | grep "$BINARY_NAME"
