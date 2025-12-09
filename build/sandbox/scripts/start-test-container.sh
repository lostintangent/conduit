#!/bin/bash
# Script to start the sandbox container for integration testing

set -e

CONTAINER_NAME="conduit-sandbox-test"
IMAGE_NAME="conduit-sandbox"
PORT="${SANDBOX_PORT:-3000}"
WORKSPACE_DIR="${WORKSPACE_DIR:-$(mktemp -d)}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Starting sandbox container for integration tests...${NC}"

# Stop and remove existing container if it exists
if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo -e "${YELLOW}Stopping existing container...${NC}"
    docker stop "${CONTAINER_NAME}" >/dev/null 2>&1 || true
    docker rm "${CONTAINER_NAME}" >/dev/null 2>&1 || true
fi

# Create workspace directory with test files if it doesn't exist
if [ ! -f "${WORKSPACE_DIR}/test-file.txt" ]; then
    echo "Hello from integration test" > "${WORKSPACE_DIR}/test-file.txt"
    mkdir -p "${WORKSPACE_DIR}/test-dir"
    echo "Nested file content" > "${WORKSPACE_DIR}/test-dir/nested.txt"
fi

echo -e "${GREEN}Workspace directory: ${WORKSPACE_DIR}${NC}"

# Start the container
docker run -d \
    --name "${CONTAINER_NAME}" \
    -p "${PORT}:3000" \
    -v "${WORKSPACE_DIR}:/workspace" \
    "${IMAGE_NAME}"

# Wait for the server to be ready
echo -e "${YELLOW}Waiting for sandbox-ipc server to be ready...${NC}"
MAX_RETRIES=30
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -s "http://localhost:${PORT}/health" >/dev/null 2>&1 || \
       curl -s -o /dev/null -w "%{http_code}" "http://localhost:${PORT}" 2>/dev/null | grep -q "^[245]"; then
        echo -e "${GREEN}Sandbox container is ready on port ${PORT}${NC}"
        echo ""
        echo "Container: ${CONTAINER_NAME}"
        echo "Port: ${PORT}"
        echo "Workspace: ${WORKSPACE_DIR}"
        exit 0
    fi
    
    # Also check if WebSocket endpoint responds
    if docker logs "${CONTAINER_NAME}" 2>&1 | grep -q "Listening on"; then
        echo -e "${GREEN}Sandbox container is ready on port ${PORT}${NC}"
        echo ""
        echo "Container: ${CONTAINER_NAME}"
        echo "Port: ${PORT}"
        echo "Workspace: ${WORKSPACE_DIR}"
        exit 0
    fi
    
    RETRY_COUNT=$((RETRY_COUNT + 1))
    sleep 1
done

echo -e "${RED}Timeout waiting for sandbox container to be ready${NC}"
echo "Container logs:"
docker logs "${CONTAINER_NAME}"
exit 1
