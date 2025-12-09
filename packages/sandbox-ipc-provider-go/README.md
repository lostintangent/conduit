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
- **SSE Events** - Server-Sent Events for real-time updates

## Quick Start

### Build from Source

```bash
# Clone and build
cd packages/sandbox-ipc-provider-go
go build -o sandbox-ipc ./cmd/server

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

### API Endpoints

#### Filesystem Operations

| Method | Endpoint                                 | Description                 |
| ------ | ---------------------------------------- | --------------------------- |
| GET    | `/api/events`                            | SSE event stream            |
| GET    | `/api/fs/readDirectory?path=...`         | List directory contents     |
| GET    | `/api/fs/stat?path=...`                  | Get file/directory metadata |
| GET    | `/api/fs/readFile?path=...`              | Read file contents          |
| POST   | `/api/fs/writeFile?path=...`             | Write file contents         |
| POST   | `/api/fs/createDirectory?path=...`       | Create directory            |
| DELETE | `/api/fs/delete?path=...&recursive=true` | Delete file/directory       |
| POST   | `/api/fs/rename?oldPath=...&newPath=...` | Rename/move file            |
| GET    | `/api/fs/exists?path=...`                | Check if path exists        |
| GET    | `/health`                                | Health check                |

#### Future Endpoints (Planned)

| Method | Endpoint                      | Description             |
| ------ | ----------------------------- | ----------------------- |
| POST   | `/api/terminal/create`        | Create terminal session |
| POST   | `/api/terminal/resize`        | Resize terminal         |
| WS     | `/api/terminal/ws`            | Terminal WebSocket      |
| GET    | `/api/git/status`             | Git status              |
| POST   | `/api/git/commit`             | Git commit              |
| GET    | `/api/search/files?query=...` | Search files            |
| GET    | `/api/search/text?query=...`  | Search text in files    |

### SSE Events

Connect to `/api/events` for real-time filesystem notifications:

```javascript
const events = new EventSource("http://localhost:3000/api/events");

events.addEventListener("connected", () => {
  console.log("Connected to sandbox IPC");
});

events.addEventListener("fileCreated", (e) => {
  const data = JSON.parse(e.data);
  console.log("File created:", data.path);
});

events.addEventListener("fileChanged", (e) => {
  const data = JSON.parse(e.data);
  console.log("File changed:", data.path);
});

events.addEventListener("fileRenamed", (e) => {
  const data = JSON.parse(e.data);
  console.log("Renamed:", data.oldPath, "→", data.newPath);
});

events.addEventListener("fileDeleted", (e) => {
  const data = JSON.parse(e.data);
  console.log("File deleted:", data.path);
});
```

## Cross-Platform Builds

Build for multiple platforms:

```bash
# Make build script executable
chmod +x scripts/build.sh

# Build all platforms
./scripts/build.sh

# Or build specific platform
GOOS=linux GOARCH=amd64 go build -o sandbox-ipc-linux ./cmd/server
GOOS=darwin GOARCH=arm64 go build -o sandbox-ipc-darwin ./cmd/server
```

## Architecture

```
sandbox-ipc-provider-go/
├── cmd/server/          # Main entry point
├── internal/
│   ├── types/           # Shared type definitions
│   ├── fs/              # Filesystem operations + gitignore
│   ├── watcher/         # File watcher with rename detection
│   ├── cache/           # LRU directory cache
│   └── server/          # HTTP/SSE server
├── Dockerfile           # Multi-stage Docker build
├── docker-compose.yml   # Docker Compose for development
└── scripts/build.sh     # Cross-platform build script
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
