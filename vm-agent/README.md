# Conduit VM File System Agent

WebSocket-based file system agent that runs inside Conduit cloud VMs to provide real-time file operations and file watching capabilities.

## Overview

This agent creates a WebSocket server that listens for file system operation requests from the Conduit client application. It provides:

- File read/write/delete operations
- Directory listing
- Real-time file watching with change notifications
- Rename detection
- Low-latency bidirectional communication

## Installation

```bash
npm install
npm run build
```

## Usage

### Starting the Agent

```bash
npm start
```

By default, the agent listens on port `8765`. You can override this with the `PORT` environment variable:

```bash
PORT=9000 npm start
```

### Running in a VM

This agent is designed to be deployed automatically when a Conduit VM is created. The Conduit client will:

1. Deploy the agent to the VM
2. Start the agent process
3. Forward the WebSocket port
4. Connect to the agent for file operations

## Protocol

The agent communicates using JSON messages over WebSocket.

### Request Types

- `read-file`: Read file contents
- `write-file`: Write content to a file
- `delete-file`: Delete a file
- `list-directory`: Get directory tree
- `watch-directory`: Start watching for file changes
- `unwatch-directory`: Stop watching a directory
- `ping`: Health check

### Response Types

- `response`: Successful operation result
- `error`: Error response
- `file-changed`: File was added, changed, or deleted
- `file-renamed`: File was renamed
- `tree-changed`: Directory structure changed
- `pong`: Ping response

## Example Messages

### Read File Request

```json
{
  "type": "read-file",
  "id": "req-123",
  "path": "/workspace/src/app.ts"
}
```

### Response

```json
{
  "type": "response",
  "id": "req-123",
  "data": "// file contents here"
}
```

### File Change Event

```json
{
  "type": "file-changed",
  "cwd": "/workspace",
  "filePath": "/workspace/src/app.ts",
  "relativePath": "src/app.ts",
  "eventType": "changed"
}
```

## Development

```bash
# Build
npm run build

# Build and run
npm run dev
```

## Architecture

- **index.ts**: Main WebSocket server and request handler
- **file-operations.ts**: File system operations (read, write, delete, list)
- **watcher.ts**: Directory watching using @parcel/watcher
- **protocol.ts**: TypeScript types for the WebSocket protocol

## Dependencies

- **ws**: WebSocket server implementation
- **@parcel/watcher**: High-performance file watching
