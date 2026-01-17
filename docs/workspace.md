# Workspace Architecture

This document provides a comprehensive overview of how Conduit workspaces are structured, persisted, and converted between different formats.

## Table of Contents

- [Overview](#overview)
- [Data Flow](#data-flow)
- [Workspace Formats](#workspace-formats)
  - [Renderer State](#renderer-state)
  - [Workspace State](#workspace-state)
  - [Workspace Templates](#workspace-templates)
- [Workspace Template Reference](#workspace-template-reference)
  - [Tab Layout Syntax](#layout-syntax)
  - [Pane Type Inference](#pane-type-inference)
  - [String Shorthand](#string-shorthand)
  - [Pane References](#pane-references)
  - [CWD Inheritance](#cwd-inheritance)
  - [Active State](#active-state)
- [Type Relationships](#type-relationships)
- [Conversion Process](#conversion-process)
- [File Structure](#file-structure)

## Overview

Conduit workspaces represent the complete state of a user's tab layout, including terminal sessions, browser panes, and editor configurations. The workspace system supports:

1. **Auto-saving** - Automatically persists the last workspace on close for session restore
2. **Named workspaces** - User-saved workspace configurations for quick access
3. **Import/Export** - YAML-based workspace templates for sharing and version control

The workspace system uses three distinct representations optimized for different purposes:

| Format         | Purpose     | Storage              | Optimized For                     |
| -------------- | ----------- | -------------------- | --------------------------------- |
| Renderer State | Runtime UI  | Memory (Jotai atoms) | Fast access, reactive updates     |
| Workspace      | Persistence | JSON file            | Complete serialization            |
| Template       | Sharing     | YAML file            | Human readability, minimal syntax |

## Data Flow

```
                    ┌─────────────────┐
                    │  Renderer Tab[] │
                    └────────┬────────┘
                             │ serializeTabs (index.ts)
                             ▼
┌──────────────┐    ┌─────────────────┐    ┌──────────────────┐
│   Template   │◄──►│    Workspace    │◄──►│   JSON Storage   │
│    (YAML)    │    │   (shared type) │    │                  │
└──────────────┘    └─────────────────┘    └──────────────────┘
        ▲                                           ▲
        │ convertTemplateToWorkspace                │
        │ convertWorkspaceToTemplate                │
        │ (template/converter.ts)                   │
        │                                           │
   Import/Export                              Save/Load
   (user-facing)                            (auto-persist)
```

### Flow Descriptions

- **Renderer → Workspace**: When saving, the renderer's `Tab[]` is serialized to `Workspace` format, capturing terminal commands from live sessions
- **Workspace → JSON**: The serialized workspace is persisted to `workspaces.json` in the user data directory
- **Workspace ↔ Template**: Bidirectional conversion for import/export functionality

## Workspace Formats

### Renderer State

The renderer maintains workspace state in Jotai atoms for reactive UI updates. This format is optimized for fast pane lookups and real-time state management.

**Source:** `src/renderer/types.ts`

```typescript
type Tab = TabMetadata & {
  id: string;
  panes: Record<string, Pane>; // Keyed by pane ID for O(1) lookup
  layout: LayoutNode;
  activePaneId: string;
};

type Pane = TerminalPane | BrowserPane | EditorPane;
```

**Key characteristics:**

- Panes stored as `Record<string, Pane>` for fast access by ID
- Layout tree references panes by `paneId`
- Includes runtime-only fields like `sessionId` and `title`
- Terminal panes track agent session metadata

**Example renderer terminal pane:**

```typescript
{
  id: "pane-abc123",
  type: "terminal",
  sessionId: "sess-xyz789",      // Runtime PTY session
  cwd: "/Users/dev/project",
  title: "zsh",           // Current process name
  command: null,                 // Captured on save
  vmId: "vm-123"                 // Cloud VM ID (connection details managed by backend)
}
```

### Workspace State

The workspace format is used for JSON persistence. It's a complete serialization of the workspace suitable for storage and restoration.

**Source:** `src/shared/types/workspace.ts`

```typescript
type Workspace = {
  name: string;
  lastModified: number;
  tabs: WorkspaceTab[];
  activeTabId: string;
};

type WorkspaceTab = TabMetadata & {
  id: string;
  panes: Pane[]; // Array format for JSON serialization
  activePaneId: string;
  layout: LayoutNode;
};
```

**Key characteristics:**

- Panes stored as `Pane[]` array (converted from Record on save)
- Includes `lastModified` timestamp for sorting
- Stored in `{userData}/workspaces.json`
- Terminal commands captured from live sessions during save

**Example workspace structure:**

```json
{
  "name": "My Project",
  "lastModified": 1701619200000,
  "activeTabId": "tab-1",
  "tabs": [
    {
      "id": "tab-1",
      "name": "Development",
      "panes": [
        {
          "id": "pane-1",
          "type": "terminal",
          "cwd": "/Users/dev/project",
          "command": "npm run dev"
        },
        {
          "id": "pane-2",
          "type": "editor",
          "cwd": "/Users/dev/project",
          "treeMode": "all"
        }
      ],
      "layout": {
        "type": "split",
        "direction": "row",
        "id": "layout-1",
        "children": [
          { "type": "pane", "paneId": "pane-1", "id": "layout-2" },
          { "type": "pane", "paneId": "pane-2", "id": "layout-3" }
        ]
      },
      "activePaneId": "pane-1"
    }
  ]
}
```

### Workspace Templates

Templates are the YAML format designed for human authoring and sharing. They use a minimal syntax with smart defaults and type inference.

**Source:** `src/ipc/workspace/template/types.ts`

```typescript
type WorkspaceTemplate = {
  name: string;
  cwd?: string; // Default CWD for all panes
  tabs: TemplateTab[];
};

type TemplateTab = TabMetadata & {
  cwd?: string; // Tab-level CWD override
  active?: boolean;
} & (TemplateSplit | TemplatePane);

type TemplatePane = Partial<TerminalPane & BrowserPane & EditorPane> & {
  type?: PaneType; // Inferred if not specified
  active?: boolean;
  collapsed?: boolean;
};

type TemplateSplit = {
  row?: TemplateLayoutNode[]; // Horizontal split
  column?: TemplateLayoutNode[]; // Vertical split
  panes?: TemplateLayoutNode[]; // Alias for row (preferred at tab level)
};

// Pane inputs can be objects, strings (commands/URLs), or null (empty terminal)
type TemplateLayoutNode = TemplatePane | TemplateSplit | string | null;
```

## Workspace Template Reference

A workspace template has three top-level properties:

| Property | Required | Description                                  |
| -------- | -------- | -------------------------------------------- |
| `name`   | Yes      | Display name for the workspace               |
| `cwd`    | No       | Default working directory for all tabs/panes |
| `tabs`   | Yes      | Array of tab definitions                     |

```yaml
name: My Workspace
cwd: ~/projects/my-app
tabs:
  - name: Development
    panes:
      - npm start
      - file://
```

### Tab Layout Syntax

Tab layouts are defined using `row:`, `column:`, or `panes:` properties:

| Property  | Direction  | Description                               |
| --------- | ---------- | ----------------------------------------- |
| `row:`    | Horizontal | Panes arranged left to right              |
| `column:` | Vertical   | Panes arranged top to bottom              |
| `panes:`  | Horizontal | Alias for `row:` (preferred at tab level) |

```yaml
# Horizontal split (side by side)
panes:
  - npm start
  - npm test

# Vertical split (stacked)
column:
  - npm start
  - npm test

# Nested layouts
panes:
  - column:
      - npm start
      - npm test
  - file://
```

**Inline Array Syntax:** For simple layouts, use inline arrays:

```yaml
panes:
  - row: [npm start, npm test] # Nested horizontal split
  - column: [copilot, lazygit] # Nested vertical split
```

### Pane Type Inference

Panes can be one of three types: `terminal`, `browser`, or `editor`. The type is automatically inferred from properties, or can be set explicitly:

| Priority | Condition                            | Inferred Type |
| -------- | ------------------------------------ | ------------- |
| 1        | Explicit `type:` property            | As specified  |
| 2        | `url:` or `devToolsFor:`             | `browser`     |
| 3        | `file:` or `treeMode:`               | `editor`      |
| 4        | Default (including string shorthand) | `terminal`    |

```yaml
# Explicit type (rarely needed)
- type: terminal

# Inferred as browser (has url)
- url: https://example.com

# Inferred as editor (has file)
- file: src/main.ts

# Inferred as terminal (default)
- command: npm start
```

### String Shorthand

Instead of full pane objects, you can use strings and null values:

| Input                         | Result                           |
| ----------------------------- | -------------------------------- |
| `http://...` or `https://...` | Browser pane with that URL       |
| `file://`                     | Editor pane (no file opened)     |
| `file://path/to/file`         | Editor pane with specified file  |
| Any other string              | Terminal pane with that command  |
| `null` or `~`                 | Empty terminal pane (no command) |

```yaml
panes:
  - npm start # Terminal with command
  - https://localhost:3000 # Browser pane
  - file://src/main.ts # Editor with file open
  - file:// # Editor (no file)
  - ~ # Empty terminal (YAML null)
```

### Pane References

Use `cloneOf` and `devToolsFor` to reference other panes:

**cloneOf (Terminals):** Creates a terminal that shares the PTY session with another terminal.

```yaml
panes:
  - npm run dev # Source terminal
  - cloneOf: npm run dev # References by command string
    collapsed: true
```

**devToolsFor (Browsers):** Opens Chrome DevTools for another browser pane.

```yaml
panes:
  - https://localhost:3000
  - devToolsFor: https://localhost:3000 # References by URL
```

**Explicit IDs:** When command/URL references aren't available or unique, use explicit IDs:

```yaml
panes:
  - id: main-terminal
    type: terminal
  - cloneOf: main-terminal # References by explicit ID
```

### CWD Inheritance

Working directories cascade down: workspace → tab → pane.

```yaml
name: My Project
cwd: ~/projects/app # Workspace-level default

tabs:
  - name: Frontend
    cwd: ~/projects/app/frontend # Tab-level override
    panes:
      - npm start # Uses tab CWD
      - cwd: ./packages/ui # Pane-level override (relative to tab)
        command: npm test
```

### Active State

The first tab and first pane in each tab are active by default. Use `active: true` only when needed:

```yaml
tabs:
  - name: First Tab        # Active by default
    panes:
      - npm start          # Active by default in this tab

  - name: Second Tab
    active: true           # Override: make this the active tab
    panes:
      - npm build
      - npm test
        active: true       # Override: make this the active pane
```

## Type Relationships

The shared type system provides common definitions used across all three formats:

| Type                                              | Location                  | Used By                  |
| ------------------------------------------------- | ------------------------- | ------------------------ |
| `PaneType`                                        | `@shared/types/panes`     | All formats              |
| `TerminalPane`, `BrowserPane`, `EditorPane`       | `@shared/types/panes`     | Workspace, Template base |
| `LayoutNode`, `LayoutPaneNode`, `LayoutSplitNode` | `@shared/types/layout`    | Workspace, Renderer      |
| `SplitDirection`                                  | `@shared/types/layout`    | All formats              |
| `TabMetadata`                                     | `@shared/types/panes`     | All formats              |
| `Workspace`, `WorkspaceTab`                       | `@shared/types/workspace` | Persistence              |

### Pane Type Extensions

The renderer extends shared pane types with runtime-specific fields:

```typescript
// Shared (serializable)
type TerminalPane = {
  id: string;
  type: "terminal";
  cwd?: string | null;
  command?: string | null;
  cloneOf?: string;
};

// Renderer (runtime)
type TerminalPane = SharedTerminalPane & {
  sessionId: string; // PTY session reference
  title: string; // Current process name
  vmId?: string; // Cloud VM ID (connection details managed by backend)
  // Agent session metadata...
};
```

## Conversion Process

### Template → Workspace (`convertTemplateToWorkspace`)

Converts a minimal YAML template into a fully-expanded workspace:

1. **Normalize inputs** - Convert string shorthand and null values to pane objects
2. **Generate IDs** - Create unique IDs for all panes and layout nodes
3. **Infer types** - Determine pane types from properties
4. **Flatten layout** - Convert nested structure to separate panes array + layout tree
5. **Resolve references** - Map template IDs/commands/URLs to generated IDs for `cloneOf`/`devToolsFor`
6. **Apply defaults** - Set default values (`treeMode: "all"`, etc.)

```typescript
const workspace = convertTemplateToWorkspace(template, "/path/to/yaml");
```

### Workspace → Template (`convertWorkspaceToTemplate`)

Converts a workspace to a minimal, human-readable template:

1. **Scan references** - Identify panes that need IDs (referenced by others)
2. **Hoist CWD** - Extract common CWD to tab level
3. **Use string shorthand** - Convert simple panes to strings (`npm start`, `https://...`, `file://...`, `null`)
4. **Prefer command/URL refs** - Use command strings for `cloneOf`, URLs for `devToolsFor`
5. **Use `panes:` at tab level** - Prefer `panes:` over `row:` for top-level layouts
6. **Omit defaults** - Skip `active: true` for first tab/pane, omit inferable `type:`

```typescript
const template = convertWorkspaceToTemplate(workspace);
const yaml = YAML.stringify(template);
```

### Renderer → Workspace (`serializeTabs`)

Converts renderer state to workspace format for persistence:

1. **Convert pane storage** - Transform `Record<string, Pane>` to `Pane[]`
2. **Capture commands** - Query live terminal sessions for current command
3. **Strip runtime fields** - Remove `sessionId`, `title`, etc.

```typescript
const serializedTabs = await serializeTabs(tabs);
```

## File Structure

### Source Files

```
src/ipc/workspace/
├── index.ts              # IPC handlers, serialization
└── template/
    ├── index.ts          # Re-exports
    ├── types.ts          # Template type definitions
    └── converter.ts      # Bidirectional conversion

src/shared/types/
├── panes.ts              # PaneType, Pane types, TabMetadata
├── layout.ts             # LayoutNode, SplitDirection
└── workspace.ts          # Workspace, WorkspaceTab, WorkspaceState

src/renderer/types.ts     # Runtime pane types with extensions
```

### IPC Handlers

| Handler                         | Description                   |
| ------------------------------- | ----------------------------- |
| `workspace:get-state`           | Get current workspace state   |
| `workspace:save-workspace`      | Save named workspace          |
| `workspace:delete-workspace`    | Delete named workspace        |
| `workspace:rename-workspace`    | Rename existing workspace     |
| `workspace:save-last-workspace` | Auto-save for session restore |
| `workspace:import`              | Import from YAML file         |
| `workspace:export-to-file`      | Export to YAML file           |

### Storage Locations

| File              | Location      | Content                               |
| ----------------- | ------------- | ------------------------------------- |
| `workspaces.json` | `{userData}/` | All saved workspaces + last workspace |
| `*.yaml`          | User-chosen   | Exported workspace templates          |
