#!/bin/bash
# Script to stop the Go sandbox server

PORT="${SANDBOX_PORT:-9876}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Stopping Go sandbox server...${NC}"

# Try to kill by PID file first
if [ -f /tmp/conduit-server-test.pid ]; then
    PID=$(cat /tmp/conduit-server-test.pid)
    if kill -0 $PID 2>/dev/null; then
        kill $PID 2>/dev/null
        echo -e "${GREEN}✅ Stopped server (PID: ${PID})${NC}"
    fi
    rm -f /tmp/conduit-server-test.pid
fi

# Also kill any process on the port (backup method)
if lsof -i :${PORT} > /dev/null 2>&1; then
    lsof -ti :${PORT} | xargs kill -9 2>/dev/null || true
    echo -e "${GREEN}✅ Killed process on port ${PORT}${NC}"
fi

echo -e "${GREEN}Server stopped${NC}"
