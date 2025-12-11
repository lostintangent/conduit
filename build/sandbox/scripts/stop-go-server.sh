#!/bin/bash
# Script to stop the Go sandbox server started for integration testing

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

PID_FILE="/tmp/conduit-server-test.pid"
WORKSPACE_FILE="/tmp/conduit-server-test.workspace"

echo -e "${YELLOW}Stopping Go sandbox server...${NC}"

if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if kill -0 "$PID" 2>/dev/null; then
        kill "$PID"
        echo -e "${GREEN}Server (PID: $PID) stopped${NC}"
    else
        echo -e "${YELLOW}Server was not running${NC}"
    fi
    rm -f "$PID_FILE"
else
    echo -e "${YELLOW}No PID file found, checking for process on port 9876...${NC}"
    if lsof -ti :9876 >/dev/null 2>&1; then
        lsof -ti :9876 | xargs kill -9 2>/dev/null || true
        echo -e "${GREEN}Killed process on port 9876${NC}"
    else
        echo -e "${YELLOW}No server process found${NC}"
    fi
fi

# Clean up workspace if it was a temp directory
if [ -f "$WORKSPACE_FILE" ]; then
    WORKSPACE=$(cat "$WORKSPACE_FILE")
    if [[ "$WORKSPACE" == /tmp/* ]] || [[ "$WORKSPACE" == /var/folders/* ]]; then
        rm -rf "$WORKSPACE"
        echo -e "${GREEN}Cleaned up temp workspace: $WORKSPACE${NC}"
    fi
    rm -f "$WORKSPACE_FILE"
fi

echo -e "${GREEN}Done${NC}"
