# sandbox-ipc-provider-go

Standalone IPC provider for Conduit sandbox/VM environments, written in Go.

A high-performance, single-binary service that runs inside VMs backing cloud terminals. Provides IPC endpoints for filesystem operations, with future support for terminal, git, and search operations.

## Features

- **Single Binary** - No runtime dependencies, ~8MB
- **Low Memory** - ~5-10MB RAM at idle
- **Fast Startup** - ~5ms cold start
- **Real-time Watching** - Native fsnotify with rename detection
- **Smart Caching** - LRU cache for directory listings
- **Git Integration** - Automatic gitignore filtering
- **WebSocket Events** - Bidirectional real-time communication via [coder/websocket](https://github.com/coder/websocket)

## Quick Start

### Build from Source

```bash
# Clone and build
cd packages/sandbox-ipc-provider-go
go build -o sandbox-ipc .

# Run
./sandbox-ipc --workspace /path/to/project
```

### Using Docker

```bash
# Build image
docker build -t sandbox-ipc .

# Run container
docker run -p 3000:3000 -v /path/to/project:/workspace sandbox-ipc
```

## Usage

### Command Line Options

```
Usage: sandbox-ipc [options]

Options:
  -port int       Port to listen on (default 3000)
  -host string    Host to bind to (default "0.0.0.0")
  -workspace      Workspace directory to serve (default: current directory)

Environment Variables:
  WORKSPACE_PATH  Workspace directory (used if -workspace not provided)
```

### WebSocket API

Connect to `ws://localhost:3000/ws` for bidirectional communication.

#### Protocol

All messages use JSON with this envelope:

```typescript
// Request (client → server)
{
  "id": 1,                    // Unique request ID for correlation
  "method": "fs.readDirectory",
  "params": { "path": "/src" }
}

// Response (server → client)
{
  "type": "response",
  "id": 1,                    // Matches request ID
  "result": { "entries": [...] }
}

// Error (server → client)
{
  "type": "error",
  "id": 1,
  "error": { "code": -32000, "message": "File not found" }
}

// Event (server → client, unsolicited)
{
  "type": "event",
  "event": "fileChanged",
  "data": { "path": "/src/app.ts" }
}
```

#### Methods

| Method               | Params                 | Description                 |
| -------------------- | ---------------------- | --------------------------- |
| `fs.readDirectory`   | `{ path }`             | List directory contents     |
| `fs.stat`            | `{ path }`             | Get file/directory metadata |
| `fs.readFile`        | `{ path }`             | Read file contents (base64) |
| `fs.writeFile`       | `{ path, content }`    | Write file contents         |
| `fs.createDirectory` | `{ path }`             | Create directory            |
| `fs.delete`          | `{ path, recursive }`  | Delete file/directory       |
| `fs.rename`          | `{ oldPath, newPath }` | Rename/move file            |
| `fs.exists`          | `{ path }`             | Check if path exists        |

#### Events

| Event              | Data                                | Description               |
| ------------------ | ----------------------------------- | ------------------------- |
| `connected`        | `{ workspace }`                     | Connection established    |
| `fileCreated`      | `{ path, isDirectory }`             | File/directory created    |
| `fileChanged`      | `{ path }`                          | File content modified     |
| `fileDeleted`      | `{ path, isDirectory }`             | File/directory deleted    |
| `fileRenamed`      | `{ oldPath, newPath, isDirectory }` | File/directory renamed    |
| `directoryChanged` | `{ path, entries }`                 | Directory listing changed |

#### Future Methods (Planned)

| Method            | Description             |
| ----------------- | ----------------------- |
| `terminal.create` | Create terminal session |
| `terminal.resize` | Resize terminal         |
| `terminal.write`  | Write to terminal       |
| `git.status`      | Get git status          |
| `git.commit`      | Commit changes          |
| `search.files`    | Search file names       |
| `search.text`     | Search text in files    |

### Health Check

HTTP endpoint for container probes:

```
GET /health
```

### Example Client

```javascript
const ws = new WebSocket("ws://localhost:3000/ws");

// Request helper
let requestId = 0;
const pending = new Map();

function call(method, params) {
  return new Promise((resolve, reject) => {
    const id = ++requestId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

// Handle messages
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);

  if (msg.type === "response" || msg.type === "error") {
    const handler = pending.get(msg.id);
    if (handler) {
      pending.delete(msg.id);
      if (msg.error) {
        handler.reject(new Error(msg.error.message));
      } else {
        handler.resolve(msg.result);
      }
    }
  } else if (msg.type === "event") {
    console.log("Event:", msg.event, msg.data);
  }
};

// Usage
ws.onopen = async () => {
  const dir = await call("fs.readDirectory", { path: "/src" });
  console.log("Directory:", dir.entries);
};
```

## Cross-Platform Builds

Build for multiple platforms:

```bash
# Build all platforms
make build-all

# Or build specific platform
GOOS=linux GOARCH=amd64 go build -o sandbox-ipc-linux .
GOOS=darwin GOARCH=arm64 go build -o sandbox-ipc-darwin .
```

## Testing

A comprehensive TypeScript test suite is provided in the `test/` directory.

### Running Tests

```bash
# Build the server
go build -o sandbox-ipc .

# Start the server with a test workspace
mkdir -p /tmp/sandbox-ipc-test
./sandbox-ipc --port 3002 --workspace /tmp/sandbox-ipc-test &

# Install test dependencies
cd test
npm install

# Run tests
npm test
```

### Test Coverage

The test suite covers:

- **Health endpoint** - Server status check
- **fs.readDirectory** - Directory listing
- **fs.stat** - File and directory metadata
- **fs.readFile** - File content reading
- **fs.writeFile** - File content writing
- **fs.createDirectory** - Directory creation
- **fs.exists** - Path existence check
- **fs.rename** - File/directory renaming
- **fs.delete** - File/directory deletion (including recursive)
- **fileCreated event** - Real-time file creation events
- **fileChanged event** - Real-time file modification events
- **fileDeleted event** - Real-time file deletion events
- **directoryChanged event** - Real-time directory listing updates
- **Error handling** - Invalid methods and paths

## Architecture

```
sandbox-ipc-provider-go/
├── main.go              # Entry point
├── server.go            # HTTP/SSE server
├── types/
│   └── types.go         # Shared type definitions
├── fs/
│   ├── provider.go      # Filesystem operations
│   ├── gitignore.go     # Gitignore filtering
│   ├── watcher.go       # File watcher with rename detection
│   └── cache.go         # LRU directory cache
├── Dockerfile           # Multi-stage Docker build
└── Makefile             # Build commands
```

## Performance Comparison

| Metric         | TypeScript           | Go                   |
| -------------- | -------------------- | -------------------- |
| Binary size    | ~50MB (with Node.js) | ~8MB                 |
| Memory at idle | ~50-80MB             | ~5-10MB              |
| Startup time   | ~200-500ms           | ~5-10ms              |
| Dependencies   | Node.js runtime      | None (static binary) |

## Integration with Conduit

This server provides the IPC bridge between the Conduit editor and sandbox VMs. The editor connects via HTTP/SSE for all sandbox operations.

```
┌─────────────────────────────────────────┐
│  Conduit (Electron)                     │
│  ┌───────────────────────────────────┐  │
│  │  Sandbox Client                   │  │
│  │  (TypeScript, runs in renderer)   │  │
│  └───────────────────────────────────┘  │
└──────────────────┬──────────────────────┘
                   │ HTTP/SSE/WebSocket
                   ▼
┌─────────────────────────────────────────┐
│  Cloud VM / Sandbox                     │
│  ┌───────────────────────────────────┐  │
│  │  sandbox-ipc (~8MB binary)        │  │
│  │  - Filesystem operations          │  │
│  │  - File watching (fsnotify)       │  │
│  │  - Git operations (planned)       │  │
│  │  - Terminal PTY (planned)         │  │
│  │  - Search/grep (planned)          │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

## License

MIT
