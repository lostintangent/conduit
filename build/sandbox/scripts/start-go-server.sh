#!/bin/bash
# Script to build and start the Go sandbox server directly (without Docker)
# This provides faster test iteration than Docker-based testing

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

# Check if Go is installed
if ! command -v go &> /dev/null; then
    echo -e "${RED}Error: Go is not installed. Please install Go first.${NC}"
    exit 1
fi

# Create workspace directory with test files if it doesn't exist
if [ ! -f "${WORKSPACE_DIR}/test-file.txt" ]; then
    echo "Hello from integration test" > "${WORKSPACE_DIR}/test-file.txt"
    mkdir -p "${WORKSPACE_DIR}/test-dir"
    echo "Nested file content" > "${WORKSPACE_DIR}/test-dir/nested.txt"
fi

echo -e "${GREEN}Workspace directory: ${WORKSPACE_DIR}${NC}"

# Build the server
echo -e "${YELLOW}Building conduit-server...${NC}"
cd "${SERVER_DIR}"

# Check if go.mod exists
if [ ! -f "go.mod" ]; then
    echo -e "${RED}Error: go.mod not found in ${SERVER_DIR}${NC}"
    exit 1
fi

go build -o conduit-server .

if [ $? -ne 0 ]; then
    echo -e "${RED}Error: Failed to build conduit-server${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Build successful${NC}"

# Kill any existing server on the port
if lsof -i :${PORT} > /dev/null 2>&1; then
    echo -e "${YELLOW}Killing existing process on port ${PORT}...${NC}"
    lsof -ti :${PORT} | xargs kill -9 2>/dev/null || true
    sleep 1
fi

# Start the server in the background
echo -e "${YELLOW}Starting server on port ${PORT}...${NC}"
./conduit-server -port ${PORT} -workspace "${WORKSPACE_DIR}" &
SERVER_PID=$!

# Save PID to file for later cleanup
echo $SERVER_PID > /tmp/conduit-server-test.pid

# Wait for the server to be ready
echo -e "${YELLOW}Waiting for server to be ready...${NC}"
MAX_RETRIES=30
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -s "http://localhost:${PORT}/health" >/dev/null 2>&1; then
        echo -e "${GREEN}✅ Go sandbox server is ready on port ${PORT}${NC}"
        echo ""
        echo -e "${GREEN}Server PID: ${SERVER_PID}${NC}"
        echo -e "${GREEN}Port: ${PORT}${NC}"
        echo -e "${GREEN}Workspace: ${WORKSPACE_DIR}${NC}"
        echo ""
        echo -e "${YELLOW}To stop the server, run: npm run test:sandbox:stop:go${NC}"
        exit 0
    fi
    
    # Check if process is still running
    if ! kill -0 $SERVER_PID 2>/dev/null; then
        echo -e "${RED}Error: Server process died unexpectedly${NC}"
        exit 1
    fi
    
    RETRY_COUNT=$((RETRY_COUNT + 1))
    sleep 0.5
done

echo -e "${RED}Error: Server failed to start within timeout${NC}"
kill $SERVER_PID 2>/dev/null || true
exit 1
