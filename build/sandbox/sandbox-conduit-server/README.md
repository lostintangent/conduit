# sandbox-conduit-server

Standalone IPC provider for Conduit sandbox/VM environments, written in Go.

A high-performance, single-binary service that runs inside VMs backing cloud terminals. Provides IPC endpoints for filesystem operations, with future support for terminal, git, and search operations.

## Features

- **Single Binary** - No runtime dependencies, ~8MB
- **Low Memory** - ~5-10MB RAM at idle
- **Fast Startup** - ~5ms cold start
- **Real-time Watching** - Native fsnotify with rename detection
- **Smart Caching** - LRU cache for directory listings
- **Background Prefetch** - Proactively caches child directories
- **Cache Verification** - Validates cache freshness with cooldown
- **Git Integration** - Full git support with automatic gitignore filtering
- **WebSocket Events** - Bidirectional real-time communication via [coder/websocket](https://github.com/coder/websocket)
- **Multi-Client Workspaces** - Reference-counted workspace sessions with automatic cleanup

## Architecture

### Per-Client Workspace Sessions

The server uses a **WorkspaceManager** that manages workspace sessions with reference counting:

```
Client1 connects (/ws?workspace=/path/a) → Creates new session, refCount=1
Client2 connects (/ws?workspace=/path/a) → Reuses session, refCount=2
Client2 disconnects                      → refCount=1
Client1 disconnects                      → refCount=0, cleanup session
```

**Benefits:**

- Multiple terminals can share the same workspace efficiently
- Different terminals can connect to different workspaces on the same server
- Automatic cleanup when the last client disconnects
- File watchers are scoped to each workspace session

## Performance Optimizations

The server includes several optimizations for responsive file browsing:

### Directory Cache (LRU)

- Caches up to 500 directory listings
- Automatically invalidated on file system events
- Provides instant responses for repeated directory reads

### Background Prefetch

- After reading a directory, child directories are prefetched in the background
- Uses a semaphore to limit to 10 concurrent prefetch operations
- Skips directories that are already cached or being prefetched
- Results in near-instant navigation when browsing directory trees

### Cache Verification

- When serving from cache, schedules a background verification
- Compares cached entries with actual filesystem state
- Uses a 2-second cooldown per directory to prevent excessive verification
- Emits `directoryChanged` event if cache becomes stale

## Quick Start

### Build from Source

```bash
# Clone and build
cd packages/sandbox-conduit-server
go build -o conduit-server .

# Run
./conduit-server --workspace /path/to/project
```

### Using Docker

```bash
# Build image
docker build -t conduit-server .

# Run container
docker run -p 9876:9876 -v /path/to/project:/workspace conduit-server
```

## Usage

### Command Line Options

```
Usage: conduit-server [options]

Options:
  -port int       Port to listen on (default 9876)
  -host string    Host to bind to (default "0.0.0.0")
  -workspace      Default workspace directory (default: current directory)

Environment Variables:
  WORKSPACE_PATH  Workspace directory (used if -workspace not provided)

WebSocket Connection:
  ws://host:port/ws                       # Uses default workspace
  ws://host:port/ws?workspace=/path/to/dir # Client-specified workspace
```

### WebSocket API

Connect to `ws://localhost:9876/ws` for bidirectional communication.

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

#### Git Methods

| Method                       | Params                  | Description                       |
| ---------------------------- | ----------------------- | --------------------------------- |
| `git.status`                 | `{}`                    | Get repository status             |
| `git.fileStatus`             | `{ path }`              | Get status for a specific file    |
| `git.branch`                 | `{}`                    | Get current branch name           |
| `git.branches`               | `{}`                    | Get all branches (local & remote) |
| `git.diff`                   | `{ path, staged? }`     | Get file diff                     |
| `git.fileAtRef`              | `{ path, ref }`         | Get file content at ref           |
| `git.stage`                  | `{ files }`             | Stage files for commit            |
| `git.unstage`                | `{ files }`             | Unstage files                     |
| `git.commit`                 | `{ message, options? }` | Create a commit                   |
| `git.checkout`               | `{ ref }`               | Checkout branch/ref               |
| `git.revert`                 | `{ files }`             | Discard local file changes        |
| `git.hasUncommittedChanges`  | `{}`                    | Check for uncommitted changes     |
| `git.hasUnpushedCommits`     | `{}`                    | Check for unpushed commits        |
| `git.changedFilesFromBranch` | `{ baseBranch }`        | Get files changed from base       |
| `git.uncommittedDiffStats`   | `{}`                    | Get diff stats (lines +/-)        |
| `git.mostRecentDirtyFile`    | `{}`                    | Get most recently modified file   |

#### Events

| Event              | Data                                   | Description               |
| ------------------ | -------------------------------------- | ------------------------- |
| `connected`        | `{ workspace }`                        | Connection established    |
| `fileCreated`      | `{ path, isDirectory }`                | File/directory created    |
| `fileChanged`      | `{ path }`                             | File content modified     |
| `fileDeleted`      | `{ path, isDirectory }`                | File/directory deleted    |
| `fileRenamed`      | `{ oldPath, newPath, isDirectory }`    | File/directory renamed    |
| `directoryChanged` | `{ path, entries }`                    | Directory listing changed |
| `gitStatusChanged` | `{ status, added, modified, removed }` | Git status changed        |
| `gitBranchChanged` | `{ previousBranch, currentBranch }`    | Branch changed            |
| `gitHeadChanged`   | `{ previousHead, currentHead }`        | HEAD changed              |

#### Future Methods (Planned)

| Method            | Description             |
| ----------------- | ----------------------- |
| `terminal.create` | Create terminal session |
| `terminal.resize` | Resize terminal         |
| `terminal.write`  | Write to terminal       |
| `search.files`    | Search file names       |
| `search.text`     | Search text in files    |

### Health Check

HTTP endpoint for container probes:

```
GET /health
```

### Example Client

```javascript
const ws = new WebSocket("ws://localhost:9876/ws");

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
GOOS=linux GOARCH=amd64 go build -o conduit-server-linux .
GOOS=darwin GOARCH=arm64 go build -o conduit-server-darwin .
```

## Testing

A comprehensive TypeScript test suite is provided in the `test/` directory.

### Running Tests

```bash
# Build the server
go build -o conduit-server .

# Start the server with a test workspace
mkdir -p /tmp/conduit-server-test
./conduit-server --port 3002 --workspace /tmp/conduit-server-test &

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
- **git.status** - Git repository status
- **git.branch** - Current branch
- **git.branches** - All branches listing
- **git.hasUncommittedChanges** - Uncommitted changes check
- **git.uncommittedDiffStats** - Diff statistics

## Architecture

```
sandbox-conduit-server/
├── main.go              # Entry point
├── server.go            # WebSocket server
├── types/
│   └── types.go         # Shared type definitions (fs + git)
├── fs/
│   ├── provider.go      # Filesystem operations
│   ├── gitignore.go     # Gitignore filtering
│   ├── watcher.go       # File watcher with rename detection
│   ├── cache.go         # LRU directory cache
│   ├── prefetch.go      # Background prefetching
│   └── verify.go        # Cache verification
├── git/
│   ├── provider.go      # Git operations (status, stage, commit, etc.)
│   └── watcher.go       # .git directory watcher for status changes
├── test/                # TypeScript test suite
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
│  │  conduit-server (~8MB binary)        │  │
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
