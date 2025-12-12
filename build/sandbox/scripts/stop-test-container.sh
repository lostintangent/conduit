#!/bin/bash
# Script to stop the sandbox test container

CONTAINER_NAME="conduit-sandbox-test"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Stopping sandbox test container...${NC}"

if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    docker stop "${CONTAINER_NAME}" >/dev/null 2>&1 || true
    docker rm "${CONTAINER_NAME}" >/dev/null 2>&1 || true
    echo -e "${GREEN}Container stopped and removed${NC}"
else
    echo -e "${YELLOW}Container not found (already stopped?)${NC}"
fi
