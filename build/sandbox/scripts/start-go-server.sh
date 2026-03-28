#!/bin/bash
# Script to build and start the Go sandbox server directly for fast integration testing
# This is the fast alternative to Docker-based testing

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="${SCRIPT_DIR}/../sandbox-conduit-server"
PORT="${SANDBOX_PORT:-9876}"
WORKSPACE_DIR="${WORKSPACE_DIR:-$(mktemp -d)}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Starting Go sandbox server for integration tests...${NC}"

# Build the server
echo -e "${YELLOW}Building conduit-server...${NC}"
cd "${SERVER_DIR}"
go build -o conduit-server .
echo -e "${GREEN}Build successful${NC}"

# Create workspace directory with test files if it doesn't exist
if [ ! -f "${WORKSPACE_DIR}/test-file.txt" ]; then
    echo "Hello from integration test" > "${WORKSPACE_DIR}/test-file.txt"
    mkdir -p "${WORKSPACE_DIR}/test-dir"
    echo "Nested file content" > "${WORKSPACE_DIR}/test-dir/nested.txt"
fi

echo -e "${GREEN}Workspace directory: ${WORKSPACE_DIR}${NC}"

# Kill any existing server on the port
if lsof -i :${PORT} >/dev/null 2>&1; then
    echo -e "${YELLOW}Killing existing process on port ${PORT}...${NC}"
    lsof -ti :${PORT} | xargs kill -9 2>/dev/null || true
    sleep 1
fi

# Start the server in background
echo -e "${YELLOW}Starting server on port ${PORT}...${NC}"
"${SERVER_DIR}/conduit-server" --port "${PORT}" --workspace "${WORKSPACE_DIR}" &
SERVER_PID=$!

# Save PID for stop script
echo "${SERVER_PID}" > /tmp/conduit-server-test.pid
echo "${WORKSPACE_DIR}" > /tmp/conduit-server-test.workspace

# Wait for server to be ready
echo -e "${YELLOW}Waiting for server to be ready...${NC}"
MAX_RETRIES=30
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -s "http://localhost:${PORT}/health" >/dev/null 2>&1; then
        echo -e "${GREEN}Server is ready on port ${PORT}${NC}"
        echo ""
        echo -e "${GREEN}Server PID: ${SERVER_PID}${NC}"
        echo -e "${GREEN}Port: ${PORT}${NC}"
        echo -e "${GREEN}Workspace: ${WORKSPACE_DIR}${NC}"
        echo ""
        echo -e "${YELLOW}To stop: npm run test:sandbox:go:stop${NC}"
        exit 0
    fi
    
    # Check if server is still running
    if ! kill -0 $SERVER_PID 2>/dev/null; then
        echo -e "${RED}Server process died unexpectedly${NC}"
        exit 1
    fi
    
    RETRY_COUNT=$((RETRY_COUNT + 1))
    sleep 0.5
done

echo -e "${RED}Server failed to start within timeout${NC}"
kill $SERVER_PID 2>/dev/null || true
exit 1
